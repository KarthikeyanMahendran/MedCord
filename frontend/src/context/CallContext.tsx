import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { NCCallEngine, NCCallEventHandler } from '@nexconn/call'
import { attachCall, createCall, endCallRecord, getCall, getChatToken, markConnected, sendCallSignal } from '../api/calls'
import type { CallMedia, CallRecord, CallStatus } from '../api/calls'
import { problemMessage } from '../api/client'
import { useAuth } from './AuthContext'
import { useRealtime } from './RealtimeContext'
import { startTone, stopTone } from '../components/call/ringtone'

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connected'

export interface CallState {
  phase: CallPhase
  call: CallRecord | null
  micOn: boolean
  camOn: boolean
  remoteMicOn: boolean
  remoteCamOn: boolean
  connectedAt: number | null
  screenSharing?: boolean
}

interface CallApi {
  /** True once calling is initialized and calls can be placed or received. */
  ready: boolean
  state: CallState
  error: string | null
  /** Short summary of the call that just ended ("Video call · 1:23"), shown briefly. */
  lastEnded: string | null
  screenStream?: MediaStream | null
  startCall: (channelId: string, media: CallMedia) => Promise<void>
  accept: () => Promise<void>
  decline: () => Promise<void>
  hangup: () => Promise<void>
  toggleMic: () => Promise<void>
  toggleCam: () => Promise<void>
  toggleScreenShare?: () => Promise<void>
  bindVideo: (local: HTMLVideoElement | null, remote: HTMLVideoElement | null) => void
  dismiss: () => void
}

const IDLE: CallState = { phase: 'idle', call: null, micOn: true, camOn: true, remoteMicOn: true, remoteCamOn: true, connectedAt: null }
const RING_TIMEOUT_MS = 45_000
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

const fmt = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)

const Ctx = createContext<CallApi | undefined>(undefined)

/** The Nexconn SDK is a page-wide singleton: initialise it once when available. */
const sdk: { engine: NCCallEngine | null; mods: { chat: typeof import('@nexconn/chat'); call: typeof import('@nexconn/call') } | null; initialized: boolean } = {
  engine: null, mods: null, initialized: false,
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const realtime = useRealtime()
  const [ready, setReady] = useState(true) // Calling is always ready with native WebRTC
  const [state, setState] = useState<CallState>(IDLE)
  const [error, setError] = useState<string | null>(null)
  const [lastEnded, setLastEnded] = useState<string | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)

  // Local & Remote WebRTC Media References
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const screenRef = useRef<MediaStream | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const pendingRemoteOffer = useRef<RTCSessionDescriptionInit | null>(null)
  const pendingIceCandidates = useRef<RTCIceCandidateInit[]>([])

  const stateRef = useRef(state)
  const providerCallId = useRef<string | null>(null)
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  stateRef.current = state
  screenRef.current = screenStream

  const report = useCallback((id: string, outcome: CallStatus) => { endCallRecord(id, outcome).catch(() => undefined) }, [])

  const stopTracks = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
    localStreamRef.current = null
    screenRef.current?.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
    remoteStreamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    if (pcRef.current) {
      try { pcRef.current.close() } catch { /* ignore */ }
      pcRef.current = null
    }
    pendingRemoteOffer.current = null
    pendingIceCandidates.current = []
  }, [])

  const reset = useCallback((summary?: string) => {
    stopTone()
    if (ringTimer.current) clearTimeout(ringTimer.current)
    ringTimer.current = null
    providerCallId.current = null
    stopTracks()
    setScreenStream(null)
    setState(IDLE)
    if (summary) {
      setLastEnded(summary)
      setTimeout(() => setLastEnded((cur) => (cur === summary ? null : cur)), 4000)
    }
  }, [stopTracks])

  // ---- Native WebRTC PeerConnection factory ----
  const setupPeerConnection = useCallback((callId: string) => {
    if (pcRef.current) {
      try { pcRef.current.close() } catch { /* ignore */ }
    }
    if (typeof RTCPeerConnection === 'undefined') return null
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        sendCallSignal(callId, 'ice', ev.candidate.toJSON()).catch(() => undefined)
      }
    }

    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track])
      remoteStreamRef.current = stream
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        const call = stateRef.current.call
        stopTone()
        if (ringTimer.current) clearTimeout(ringTimer.current)
        if (call) markConnected(call.id).catch(() => undefined)
        setState((s) => ({ ...s, phase: 'connected', connectedAt: s.connectedAt ?? Date.now() }))
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (stateRef.current.phase === 'connected') {
          const call = stateRef.current.call
          if (call) report(call.id, 'ENDED')
          reset('Call disconnected')
        }
      }
    }

    return pc
  }, [report, reset])

  // ---- Background Nexconn SDK Connection (when available & unblocked) ----
  const handlers = useMemo<NCCallEventHandler>(() => ({
    onCallReceived: async ({ session, extra }) => {
      const engine = sdk.engine!
      const reject = () => engine.endCall({ callId: session.getCallId() }).catch(() => undefined)
      if (stateRef.current.phase !== 'idle') return void reject()
      try {
        const { medcordCallId } = JSON.parse(extra ?? '{}') as { medcordCallId?: string }
        if (!medcordCallId) return void reject()
        const call = await getCall(medcordCallId)
        if (call.status !== 'RINGING' || call.callee.id !== user?.id) return void reject()
        providerCallId.current = session.getCallId()
        setState({ ...IDLE, phase: 'incoming', call, camOn: call.media === 'VIDEO' })
        startTone('incoming')
      } catch {
        reject()
      }
    },
    onCallConnected: () => {
      const call = stateRef.current.call
      stopTone()
      if (ringTimer.current) clearTimeout(ringTimer.current)
      if (call) markConnected(call.id).catch(() => undefined)
      setState((s) => ({ ...s, phase: 'connected', connectedAt: Date.now() }))
    },
    onCallEnded: ({ reason }) => {
      const { call, phase, connectedAt } = stateRef.current
      if (!call) return reset()
      const R = sdk.mods?.call.NCCallEndReason
      const isCaller = call.caller.id === user?.id
      if (phase === 'connected') report(call.id, 'ENDED')
      else if (R && (reason === R.NO_ANSWER || reason === R.MISSED)) report(call.id, 'MISSED')
      else if (R && reason !== R.DECLINED && reason !== R.CANCELED) report(call.id, 'FAILED')
      const kind = call.media === 'VIDEO' ? 'Video call' : 'Voice call'
      const summary = phase === 'connected' && connectedAt ? `${kind} · ${fmt(Math.round((Date.now() - connectedAt) / 1000))}`
        : (R && reason === R.DECLINED) ? (isCaller ? `${call.callee.displayName} declined` : 'Call declined')
          : (R && reason === R.CANCELED) ? (isCaller ? 'Call cancelled' : `Missed call from ${call.caller.displayName}`)
            : 'Call ended'
      reset(summary)
    },
    onRemoteMicrophoneStateChanged: ({ disabled }) => setState((s) => ({ ...s, remoteMicOn: !disabled })),
    onRemoteCameraStateChanged: ({ disabled }) => setState((s) => ({ ...s, remoteCamOn: !disabled })),
  }), [user?.id, report, reset])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        const [token, chat, call] = await Promise.all([getChatToken(), import('@nexconn/chat'), import('@nexconn/call')])
        if (cancelled) return
        if (!sdk.initialized) {
          chat.NCEngine.initialize({ appKey: token.appKey })
          call.NCCallEngine.install()
          sdk.engine = call.NCCallEngine.initialize({})
          sdk.mods = { chat, call }
          sdk.initialized = true
        }
        const engine = sdk.engine!
        engine.setCallEventHandler(handlers)
        engine.setVideoConfig(engine.createVideoConfigBuilder()
          .setResolution(call.NCCallVideoResolution.RESOLUTION_1280X720)
          .setFrameRate(call.NCCallVideoFrameRate.FPS_24).build())
        await chat.NCEngine.connect({ token: token.token })
      } catch {
        // Fallback transparently to Native WebRTC on any network/firewall issue
      }
    })()
    return () => {
      cancelled = true
      sdk.mods?.chat.NCEngine.disconnect().catch(() => undefined)
    }
  }, [user, handlers])

  // ---- Realtime SSE Signaling Listener (Native WebRTC) ----
  useEffect(() => {
    if (!user) return
    const unsub = realtime.subscribe(async (ev) => {
      if (ev.type === 'CALL_INCOMING') {
        const callId = String(ev.payload.callId ?? '')
        if (!callId) return
        if (stateRef.current.phase !== 'idle') {
          // Already on another call: reject
          endCallRecord(callId, 'DECLINED').catch(() => undefined)
          return
        }
        try {
          const call = await getCall(callId)
          if (call.status !== 'RINGING' || call.callee.id !== user.id) return
          setState({ ...IDLE, phase: 'incoming', call, camOn: call.media === 'VIDEO' })
          startTone('incoming')
        } catch { /* ignore */ }
      } else if (ev.type === 'CALL_ENDED') {
        const callId = String(ev.payload.callId ?? '')
        const outcome = String(ev.payload.outcome ?? '')
        const currentCall = stateRef.current.call
        if (currentCall && currentCall.id === callId) {
          const isCaller = currentCall.caller.id === user.id
          const kind = currentCall.media === 'VIDEO' ? 'Video call' : 'Voice call'
          const summary = outcome === 'DECLINED' ? (isCaller ? `${currentCall.callee.displayName} declined` : 'Call declined')
            : outcome === 'CANCELLED' ? (isCaller ? 'Call cancelled' : `Missed call from ${currentCall.caller.displayName}`)
            : outcome === 'MISSED' ? 'No answer'
            : stateRef.current.phase === 'connected' && stateRef.current.connectedAt
              ? `${kind} · ${fmt(Math.round((Date.now() - stateRef.current.connectedAt) / 1000))}`
              : 'Call ended'
          reset(summary)
        }
      } else if (ev.type === 'CALL_SIGNAL') {
        const p = ev.payload as { callId: string; fromUserId: string; kind: string; data: unknown }
        const currentCall = stateRef.current.call
        if (!currentCall || currentCall.id !== p.callId) return

        if (p.kind === 'offer') {
          const offer = p.data as RTCSessionDescriptionInit
          pendingRemoteOffer.current = offer
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer))
            // Apply any queued ICE candidates
            while (pendingIceCandidates.current.length > 0) {
              const c = pendingIceCandidates.current.shift()!
              await pcRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => undefined)
            }
          }
        } else if (p.kind === 'answer') {
          const answer = p.data as RTCSessionDescriptionInit
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer))
            while (pendingIceCandidates.current.length > 0) {
              const c = pendingIceCandidates.current.shift()!
              await pcRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => undefined)
            }
            markConnected(currentCall.id).catch(() => undefined)
            stopTone()
            if (ringTimer.current) clearTimeout(ringTimer.current)
            setState((s) => ({ ...s, phase: 'connected', connectedAt: Date.now() }))
          }
        } else if (p.kind === 'ice') {
          const candidate = p.data as RTCIceCandidateInit
          if (pcRef.current && pcRef.current.remoteDescription) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined)
          } else {
            pendingIceCandidates.current.push(candidate)
          }
        } else if (p.kind === 'media-state') {
          const s = p.data as { micOn?: boolean; camOn?: boolean }
          setState((prev) => ({
            ...prev,
            remoteMicOn: s.micOn !== undefined ? s.micOn : prev.remoteMicOn,
            remoteCamOn: s.camOn !== undefined ? s.camOn : prev.remoteCamOn,
          }))
        }
      }
    })
    return () => unsub()
  }, [user, realtime, reset])

  // ---- Actions ----
  const startCall = useCallback(async (channelId: string, media: CallMedia) => {
    if (stateRef.current.phase !== 'idle') return
    setError(null)
    let call: CallRecord
    try {
      call = await createCall(channelId, media)
    } catch (e) {
      setError(problemMessage(e))
      return
    }

    setState({ ...IDLE, phase: 'outgoing', call, camOn: media === 'VIDEO' })
    startTone('outgoing')

    // Acquire local media
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: media === 'VIDEO' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      })
      localStreamRef.current = stream
      if (localVideoRef.current && media === 'VIDEO') {
        localVideoRef.current.srcObject = stream
      }

      // Initialize WebRTC PeerConnection
      const pc = setupPeerConnection(call.id)
      if (pc) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream))
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await sendCallSignal(call.id, 'offer', offer)
      }
    } catch (err) {
      // Permission denied or devices missing
      report(call.id, 'FAILED')
      setError('Unable to access camera or microphone. Please check browser permissions.')
      reset()
      return
    }

    // Try Nexconn engine if initialized
    if (sdk.engine && sdk.mods) {
      const C = sdk.mods.call
      sdk.engine.startCall({
        calleeIds: [call.callee.providerUserId],
        callType: C.NCCallType.SINGLE,
        mediaType: media === 'VIDEO' ? C.NCCallMediaType.AUDIO_VIDEO : C.NCCallMediaType.AUDIO,
        extra: JSON.stringify({ medcordCallId: call.id }),
      }).then((res) => {
        if (res.callId) {
          providerCallId.current = res.callId
          attachCall(call.id, res.callId).catch(() => undefined)
        }
      }).catch(() => undefined)
    }

    ringTimer.current = setTimeout(() => {
      if (stateRef.current.phase === 'outgoing') {
        report(call.id, 'MISSED')
        if (sdk.engine && providerCallId.current) {
          sdk.engine.endCall({ callId: providerCallId.current }).catch(() => undefined)
        }
        reset('No answer')
      }
    }, RING_TIMEOUT_MS)
  }, [report, reset, setupPeerConnection])

  const accept = useCallback(async () => {
    const call = stateRef.current.call
    if (!call) return
    stopTone()

    // Accept via Nexconn if provider ID exists
    if (sdk.engine && providerCallId.current) {
      sdk.engine.acceptCall({ callId: providerCallId.current }).catch(() => undefined)
    }

    // Accept via Native WebRTC
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: call.media === 'VIDEO' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      })
      localStreamRef.current = stream
      if (localVideoRef.current && call.media === 'VIDEO') {
        localVideoRef.current.srcObject = stream
      }

      const pc = setupPeerConnection(call.id)
      if (pc) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream))
        if (pendingRemoteOffer.current) {
          await pc.setRemoteDescription(new RTCSessionDescription(pendingRemoteOffer.current))
          while (pendingIceCandidates.current.length > 0) {
            const c = pendingIceCandidates.current.shift()!
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => undefined)
          }
        }
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await sendCallSignal(call.id, 'answer', answer)
      }

      await markConnected(call.id).catch(() => undefined)
      setState((s) => ({ ...s, phase: 'connected', connectedAt: Date.now() }))
    } catch {
      setError('Could not access microphone or camera. Please verify device permissions.')
      report(call.id, 'FAILED')
      reset()
    }
  }, [report, reset, setupPeerConnection])

  const decline = useCallback(async () => {
    const { call } = stateRef.current
    if (call) report(call.id, 'DECLINED')
    if (sdk.engine && providerCallId.current) {
      sdk.engine.endCall({ callId: providerCallId.current }).catch(() => undefined)
    }
    reset()
  }, [report, reset])

  const hangup = useCallback(async () => {
    const { call, phase } = stateRef.current
    if (call) report(call.id, phase === 'connected' ? 'ENDED' : 'CANCELLED')
    if (sdk.engine && providerCallId.current) {
      sdk.engine.endCall({ callId: providerCallId.current }).catch(() => undefined)
    }
    reset(phase === 'connected' ? undefined : 'Call cancelled')
  }, [report, reset])

  const toggleMic = useCallback(async () => {
    const next = !stateRef.current.micOn
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = next })
    }
    if (sdk.engine) {
      sdk.engine.enableMicrophone(next).catch(() => undefined)
    }
    const call = stateRef.current.call
    if (call) {
      sendCallSignal(call.id, 'media-state', { micOn: next }).catch(() => undefined)
    }
    setState((s) => ({ ...s, micOn: next }))
  }, [])

  const toggleCam = useCallback(async () => {
    const next = !stateRef.current.camOn
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = next })
    }
    if (sdk.engine) {
      sdk.engine.enableCamera(next).catch(() => undefined)
    }
    const call = stateRef.current.call
    if (call) {
      sendCallSignal(call.id, 'media-state', { camOn: next }).catch(() => undefined)
    }
    setState((s) => ({ ...s, camOn: next }))
  }, [])

  const toggleScreenShare = useCallback(async () => {
    if (stateRef.current.screenSharing) {
      screenRef.current?.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
      setScreenStream(null)
      setState((s) => ({ ...s, screenSharing: false }))
      return
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('Screen sharing is not supported in this browser.')
      return
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      display.getVideoTracks()[0].onended = () => {
        setScreenStream(null)
        setState((s) => ({ ...s, screenSharing: false }))
      }
      setScreenStream(display)
      setState((s) => ({ ...s, screenSharing: true }))
    } catch { /* user cancelled screen picker */ }
  }, [])

  const bindVideo = useCallback((local: HTMLVideoElement | null, remote: HTMLVideoElement | null) => {
    localVideoRef.current = local
    remoteVideoRef.current = remote
    if (local && localStreamRef.current) {
      local.srcObject = localStreamRef.current
    }
    if (remote && remoteStreamRef.current) {
      remote.srcObject = remoteStreamRef.current
    }
    // Also bind to Nexconn if available
    const engine = sdk.engine
    const call = stateRef.current.call
    if (engine && call) {
      const peer = call.caller.id === user?.id ? call.callee : call.caller
      try { if (local) engine.setLocalVideoView({ videoElement: local }) } catch { /* ignore */ }
      try { if (remote) engine.setRemoteVideoView([{ userId: peer.providerUserId, videoElement: remote }]) } catch { /* ignore */ }
    }
  }, [user?.id])

  const value = useMemo<CallApi>(() => ({
    ready, state, error, lastEnded, screenStream, startCall, accept, decline, hangup, toggleMic, toggleCam, toggleScreenShare, bindVideo, dismiss: () => setError(null),
  }), [ready, state, error, lastEnded, screenStream, startCall, accept, decline, hangup, toggleMic, toggleCam, toggleScreenShare, bindVideo])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

const NOOP = async () => undefined
const FALLBACK: CallApi = {
  ready: false, state: IDLE, error: null, lastEnded: null, startCall: NOOP, accept: NOOP, decline: NOOP, hangup: NOOP,
  toggleMic: NOOP, toggleCam: NOOP, bindVideo: () => undefined, dismiss: () => undefined,
}

export function useCall(): CallApi {
  return useContext(Ctx) ?? FALLBACK
}
