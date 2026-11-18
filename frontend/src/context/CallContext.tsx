import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { NCCallEngine, NCCallEventHandler } from '@nexconn/call'
import { attachCall, createCall, endCallRecord, getCall, getChatToken, markConnected } from '../api/calls'
import type { CallMedia, CallRecord, CallStatus } from '../api/calls'
import { problemMessage } from '../api/client'
import { useAuth } from './AuthContext'
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
}

interface CallApi {
  /** True once the realtime SDK is connected and calls can be placed or received. */
  ready: boolean
  state: CallState
  error: string | null
  /** Short summary of the call that just ended ("Video call · 1:23"), shown briefly. */
  lastEnded: string | null
  startCall: (channelId: string, media: CallMedia) => Promise<void>
  accept: () => Promise<void>
  decline: () => Promise<void>
  hangup: () => Promise<void>
  toggleMic: () => Promise<void>
  toggleCam: () => Promise<void>
  bindVideo: (local: HTMLVideoElement | null, remote: HTMLVideoElement | null) => void
  dismiss: () => void
}

const IDLE: CallState = { phase: 'idle', call: null, micOn: true, camOn: true, remoteMicOn: true, remoteCamOn: true, connectedAt: null }
const RING_TIMEOUT_MS = 45_000

/** The SDK is a page-wide singleton: initialise it exactly once, even under React StrictMode re-mounts. */
const sdk: { engine: NCCallEngine | null; mods: { chat: typeof import('@nexconn/chat'); call: typeof import('@nexconn/call') } | null; initialized: boolean } = {
  engine: null, mods: null, initialized: false,
}

const fmt = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)

const Ctx = createContext<CallApi | undefined>(undefined)

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [ready, setReady] = useState(false)
  const [state, setState] = useState<CallState>(IDLE)
  const [error, setError] = useState<string | null>(null)
  const [lastEnded, setLastEnded] = useState<string | null>(null)
  const stateRef = useRef(state)
  const providerCallId = useRef<string | null>(null)
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  stateRef.current = state

  const report = useCallback((id: string, outcome: CallStatus) => { endCallRecord(id, outcome).catch(() => undefined) }, [])

  const reset = useCallback((summary?: string) => {
    stopTone()
    if (ringTimer.current) clearTimeout(ringTimer.current)
    ringTimer.current = null
    providerCallId.current = null
    setState(IDLE)
    if (summary) {
      setLastEnded(summary)
      setTimeout(() => setLastEnded((cur) => (cur === summary ? null : cur)), 4000)
    }
  }, [])

  // ---- SDK events (registered once; read live state through refs) ----
  const handlers = useMemo<NCCallEventHandler>(() => ({
    onCallReceived: async ({ session, extra }) => {
      const engine = sdk.engine!
      const reject = () => engine.endCall({ callId: session.getCallId() }).catch(() => undefined)
      if (stateRef.current.phase !== 'idle') return void reject()             // already busy
      try {
        const { medcordCallId } = JSON.parse(extra ?? '{}') as { medcordCallId?: string }
        if (!medcordCallId) return void reject()
        const call = await getCall(medcordCallId)
        // Only ring for calls MedCord authorised, from the person MedCord says is calling.
        if (call.status !== 'RINGING' || call.callee.id !== user?.id || call.caller.providerUserId !== session.getCallerUserId()) return void reject()
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
      const R = sdk.mods!.call.NCCallEndReason
      const isCaller = call.caller.id === user?.id
      // Each side reports only what it witnessed; the server keeps the first report.
      if (phase === 'connected') report(call.id, 'ENDED')
      else if (reason === R.NO_ANSWER || reason === R.MISSED) report(call.id, 'MISSED')
      else if (reason !== R.DECLINED && reason !== R.CANCELED) report(call.id, 'FAILED')
      const kind = call.media === 'VIDEO' ? 'Video call' : 'Voice call'
      const summary = phase === 'connected' && connectedAt ? `${kind} · ${fmt(Math.round((Date.now() - connectedAt) / 1000))}`
        : reason === R.DECLINED ? (isCaller ? `${call.callee.displayName} declined` : 'Call declined')
          : reason === R.CANCELED ? (isCaller ? 'Call cancelled' : `Missed call from ${call.caller.displayName}`)
            : 'No answer'
      reset(summary)
    },
    onRemoteMicrophoneStateChanged: ({ disabled }) => setState((s) => ({ ...s, remoteMicOn: !disabled })),
    onRemoteCameraStateChanged: ({ disabled }) => setState((s) => ({ ...s, remoteCamOn: !disabled })),
  }), [user?.id, report, reset])

  // ---- Connect the SDK while signed in ----
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
        engine.setCallEventHandler(handlers)                                  // must be set before connecting
        engine.setVideoConfig(engine.createVideoConfigBuilder()
          .setResolution(call.NCCallVideoResolution.RESOLUTION_1280X720)       // HD: good quality without burning FHD/2K minutes
          .setFrameRate(call.NCCallVideoFrameRate.FPS_24).build())
        const res = await chat.NCEngine.connect({ token: token.token })
        if (cancelled) return
        if (res.isOk) setReady(true)
        else setError(`Calling is unavailable (connection code ${res.code}).`)
      } catch (e) {
        if (!cancelled) setError(`Calling is unavailable: ${problemMessage(e)}`)
      }
    })()
    return () => {
      cancelled = true
      setReady(false)
      sdk.mods?.chat.NCEngine.disconnect().catch(() => undefined)
    }
  }, [user, handlers])

  // ---- Actions ----
  const startCall = useCallback(async (channelId: string, media: CallMedia) => {
    const engine = sdk.engine
    if (!engine || !sdk.mods || stateRef.current.phase !== 'idle') return
    setError(null)
    let call: CallRecord
    try { call = await createCall(channelId, media) } catch (e) { setError(problemMessage(e)); return }
    const C = sdk.mods.call
    setState({ ...IDLE, phase: 'outgoing', call, camOn: media === 'VIDEO' })
    startTone('outgoing')
    const res = await engine.startCall({
      calleeIds: [call.callee.providerUserId],
      callType: C.NCCallType.SINGLE,
      mediaType: media === 'VIDEO' ? C.NCCallMediaType.AUDIO_VIDEO : C.NCCallMediaType.AUDIO,
      extra: JSON.stringify({ medcordCallId: call.id }),
    })
    if (res.code !== C.NCCallCode.SUCCESS || !res.callId) {
      report(call.id, 'FAILED')
      setError(res.busyLineUserList?.length ? `${call.callee.displayName} is on another call.` : `Couldn't place the call (code ${res.code}).`)
      return reset()
    }
    providerCallId.current = res.callId
    attachCall(call.id, res.callId).catch(() => undefined)
    ringTimer.current = setTimeout(() => {
      if (stateRef.current.phase === 'outgoing') {
        report(call.id, 'MISSED')
        engine.endCall({ callId: res.callId }).catch(() => undefined)
        reset('No answer')
      }
    }, RING_TIMEOUT_MS)
  }, [report, reset])

  const accept = useCallback(async () => {
    const engine = sdk.engine
    if (!engine || !providerCallId.current) return
    stopTone()
    const res = await engine.acceptCall({ callId: providerCallId.current })
    if (res.code !== sdk.mods!.call.NCCallCode.SUCCESS) setError(`Couldn't join the call (code ${res.code}). Check camera and microphone permissions.`)
  }, [])

  const decline = useCallback(async () => {
    const { call } = stateRef.current
    if (call) report(call.id, 'DECLINED')
    await sdk.engine?.endCall({ callId: providerCallId.current ?? undefined }).catch(() => undefined)
    reset()
  }, [report, reset])

  const hangup = useCallback(async () => {
    const { call, phase } = stateRef.current
    if (call) report(call.id, phase === 'connected' ? 'ENDED' : 'CANCELLED')
    await sdk.engine?.endCall({ callId: providerCallId.current ?? undefined }).catch(() => undefined)
    // onCallEnded resets with a summary; reset here too in case the SDK doesn't fire it.
    if (stateRef.current.phase !== 'idle') setTimeout(() => { if (stateRef.current.call?.id === call?.id) reset(phase === 'connected' ? undefined : 'Call cancelled') }, 1500)
  }, [report, reset])

  const toggleMic = useCallback(async () => {
    const next = !stateRef.current.micOn
    const res = await sdk.engine?.enableMicrophone(next)
    if (res && res.code === sdk.mods!.call.NCCallCode.SUCCESS) setState((s) => ({ ...s, micOn: next }))
  }, [])

  const toggleCam = useCallback(async () => {
    const next = !stateRef.current.camOn
    const res = await sdk.engine?.enableCamera(next)
    if (res && res.code === sdk.mods!.call.NCCallCode.SUCCESS) setState((s) => ({ ...s, camOn: next }))
  }, [])

  const bindVideo = useCallback((local: HTMLVideoElement | null, remote: HTMLVideoElement | null) => {
    const engine = sdk.engine
    const call = stateRef.current.call
    if (!engine || !call) return
    const peer = call.caller.id === user?.id ? call.callee : call.caller
    try { if (local) engine.setLocalVideoView({ videoElement: local }) } catch { /* not ready yet */ }
    try { if (remote) engine.setRemoteVideoView([{ userId: peer.providerUserId, videoElement: remote }]) } catch { /* not ready yet */ }
  }, [user?.id])

  const value = useMemo<CallApi>(() => ({
    ready, state, error, lastEnded, startCall, accept, decline, hangup, toggleMic, toggleCam, bindVideo, dismiss: () => setError(null),
  }), [ready, state, error, lastEnded, startCall, accept, decline, hangup, toggleMic, toggleCam, bindVideo])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

const NOOP = async () => undefined
const FALLBACK: CallApi = {
  ready: false, state: IDLE, error: null, lastEnded: null, startCall: NOOP, accept: NOOP, decline: NOOP, hangup: NOOP,
  toggleMic: NOOP, toggleCam: NOOP, bindVideo: () => undefined, dismiss: () => undefined,
}

/** Safe outside the provider (e.g. isolated component tests): calling is simply unavailable. */
export function useCall(): CallApi {
  return useContext(Ctx) ?? FALLBACK
}
