import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { joinVoiceRoom, leaveVoiceRoom, sendVoiceSignal, updateVoiceState } from '../api/voiceRooms'
import type { VoiceRoom } from '../api/voiceRooms'
import { problemMessage } from '../api/client'
import { useAuth } from './AuthContext'
import { useRealtime } from './RealtimeContext'

interface VoiceRoomApi {
  room: VoiceRoom | null
  micOn: boolean
  camOn: boolean
  screenSharing: boolean
  localStream: MediaStream | null
  screenStream: MediaStream | null
  remoteStreams: Record<string, MediaStream>
  mediaWarning: string | null
  error: string | null
  join: (channelId: string, opts?: { micOn?: boolean; camOn?: boolean }) => Promise<void>
  leave: () => Promise<void>
  toggleMic: () => Promise<void>
  toggleCam: () => Promise<void>
  toggleScreenShare: () => Promise<void>
  clearError: () => void
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

const Ctx = createContext<VoiceRoomApi | undefined>(undefined)

export function VoiceRoomProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { subscribe } = useRealtime()
  const [room, setRoom] = useState<VoiceRoom | null>(null)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({})
  const [mediaWarning, setMediaWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const roomRef = useRef<VoiceRoom | null>(null)
  const localRef = useRef<MediaStream | null>(null)
  const screenRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map())

  roomRef.current = room
  localRef.current = localStream
  screenRef.current = screenStream

  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach((pc) => { try { pc.close() } catch { /* ignore */ } })
    peersRef.current.clear()
    setRemoteStreams({})
  }, [])

  const stopTracks = (stream: MediaStream | null) => {
    stream?.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
  }

  const createPeer = useCallback((peerUserId: string, channelId: string) => {
    const existing = peersRef.current.get(peerUserId)
    if (existing) return existing
    if (typeof RTCPeerConnection === 'undefined') return null
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    peersRef.current.set(peerUserId, pc)

    localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!))
    screenRef.current?.getTracks().forEach((t) => pc.addTrack(t, screenRef.current!))

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendVoiceSignal(channelId, peerUserId, 'ice', e.candidate.toJSON()).catch(() => undefined)
      }
    }
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track])
      setRemoteStreams((prev) => ({ ...prev, [peerUserId]: stream }))
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peersRef.current.delete(peerUserId)
        setRemoteStreams((prev) => {
          const next = { ...prev }
          delete next[peerUserId]
          return next
        })
      }
    }
    return pc
  }, [])

  const negotiateWith = useCallback(async (peerUserId: string, channelId: string) => {
    const pc = createPeer(peerUserId, channelId)
    if (!pc) return
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await sendVoiceSignal(channelId, peerUserId, 'offer', offer)
    } catch { /* ignore signaling race */ }
  }, [createPeer])

  const renegotiateAll = useCallback(async (channelId: string) => {
    for (const [peerId, pc] of peersRef.current.entries()) {
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await sendVoiceSignal(channelId, peerId, 'offer', offer)
      } catch { /* ignore */ }
    }
  }, [])

  // Subscribe to SSE room updates & WebRTC signaling
  useEffect(() => {
    if (!user) return
    return subscribe((ev) => {
      const current = roomRef.current
      if (ev.type === 'VOICE_ROOM_UPDATED' && current && ev.channelId === current.channelId) {
        const updated = ev.payload as unknown as VoiceRoom
        setRoom(updated)
        const activeIds = new Set(updated.participants.map((p) => p.userId))
        // Clean up peers who left
        for (const [pid, pc] of [...peersRef.current.entries()]) {
          if (!activeIds.has(pid)) {
            try { pc.close() } catch { /* ignore */ }
            peersRef.current.delete(pid)
            setRemoteStreams((prev) => { const n = { ...prev }; delete n[pid]; return n })
          }
        }
        // Deterministic offerer (lexicographically smaller userId sends offer)
        for (const p of updated.participants) {
          if (p.userId !== user.id && !peersRef.current.has(p.userId) && user.id < p.userId) {
            void negotiateWith(p.userId, current.channelId)
          }
        }
      }
      if (ev.type === 'VOICE_SIGNAL' && current && ev.channelId === current.channelId) {
        const fromUserId = String(ev.payload.fromUserId ?? '')
        const kind = String(ev.payload.kind ?? '')
        const data = ev.payload.data
        if (!fromUserId || fromUserId === user.id) return
        void (async () => {
          const pc = createPeer(fromUserId, current.channelId)
          if (!pc) return
          try {
            if (kind === 'offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit))
              const answer = await pc.createAnswer()
              await pc.setLocalDescription(answer)
              await sendVoiceSignal(current.channelId, fromUserId, 'answer', answer)
            } else if (kind === 'answer') {
              await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit))
            } else if (kind === 'ice') {
              await pc.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit))
            }
          } catch { /* ignore transient WebRTC errors */ }
        })()
      }
    })
  }, [user, subscribe, createPeer, negotiateWith])

  const leave = useCallback(async () => {
    const cur = roomRef.current
    closeAllPeers()
    stopTracks(localRef.current)
    stopTracks(screenRef.current)
    setLocalStream(null)
    setScreenStream(null)
    setRoom(null)
    setCamOn(false)
    setScreenSharing(false)
    setMediaWarning(null)
    if (cur) {
      await leaveVoiceRoom(cur.channelId).catch(() => undefined)
    }
  }, [closeAllPeers])

  // Clean up on sign-out / unmount
  useEffect(() => {
    if (!user && roomRef.current) void leave()
  }, [user, leave])

  const join = useCallback(async (channelId: string, opts?: { micOn?: boolean; camOn?: boolean }) => {
    if (roomRef.current?.channelId === channelId) return
    if (roomRef.current) await leave()
    setError(null)
    setMediaWarning(null)

    let wantMic = opts?.micOn ?? true
    let wantCam = opts?.camOn ?? false
    let stream: MediaStream | null = null

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: wantMic, video: wantCam })
      } catch {
        setMediaWarning('Microphone/camera permission unavailable — joined in listen-only mode.')
        wantMic = false
        wantCam = false
      }
    } else {
      setMediaWarning('Browser media devices unavailable — joined in listen-only mode.')
      wantMic = false
      wantCam = false
    }

    try {
      const joined = await joinVoiceRoom(channelId, { micOn: wantMic, camOn: wantCam })
      setLocalStream(stream)
      localRef.current = stream
      setMicOn(wantMic)
      setCamOn(wantCam)
      setScreenSharing(false)
      setRoom(joined)

      // Initiate offers to peers where our userId is smaller
      if (user) {
        for (const p of joined.participants) {
          if (p.userId !== user.id && user.id < p.userId) {
            void negotiateWith(p.userId, joined.channelId)
          }
        }
      }
    } catch (e) {
      stopTracks(stream)
      setError(problemMessage(e))
    }
  }, [leave, user, negotiateWith])

  const toggleMic = useCallback(async () => {
    const cur = roomRef.current
    if (!cur) return
    const next = !micOn
    if (localRef.current) {
      const audioTracks = localRef.current.getAudioTracks()
      if (audioTracks.length > 0) {
        audioTracks.forEach((t) => { t.enabled = next })
      } else if (next && navigator.mediaDevices?.getUserMedia) {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true })
          s.getAudioTracks().forEach((t) => {
            localRef.current!.addTrack(t)
            peersRef.current.forEach((pc) => pc.addTrack(t, localRef.current!))
          })
          await renegotiateAll(cur.channelId)
        } catch {
          setMediaWarning('Could not access microphone.')
          return
        }
      }
    } else if (next && navigator.mediaDevices?.getUserMedia) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        setLocalStream(s)
        localRef.current = s
        s.getTracks().forEach((t) => peersRef.current.forEach((pc) => pc.addTrack(t, s)))
        await renegotiateAll(cur.channelId)
      } catch {
        setMediaWarning('Could not access microphone.')
        return
      }
    }
    setMicOn(next)
    try { setRoom(await updateVoiceState(cur.channelId, { micOn: next })) } catch { /* ignore */ }
  }, [micOn, renegotiateAll])

  const toggleCam = useCallback(async () => {
    const cur = roomRef.current
    if (!cur) return
    const next = !camOn
    if (next) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMediaWarning('Camera is unavailable in this browser.')
        return
      }
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true })
        const track = camStream.getVideoTracks()[0]
        const base = localRef.current ?? new MediaStream()
        base.getVideoTracks().forEach((t) => { t.stop(); base.removeTrack(t) })
        base.addTrack(track)
        const updated = new MediaStream(base.getTracks())
        setLocalStream(updated)
        localRef.current = updated
        peersRef.current.forEach((pc) => pc.addTrack(track, updated))
        await renegotiateAll(cur.channelId)
      } catch {
        setMediaWarning('Could not access camera.')
        return
      }
    } else if (localRef.current) {
      localRef.current.getVideoTracks().forEach((t) => {
        t.stop()
        localRef.current?.removeTrack(t)
      })
      setLocalStream(new MediaStream(localRef.current.getTracks()))
    }
    setCamOn(next)
    try { setRoom(await updateVoiceState(cur.channelId, { camOn: next })) } catch { /* ignore */ }
  }, [camOn, renegotiateAll])

  const toggleScreenShare = useCallback(async () => {
    const cur = roomRef.current
    if (!cur) return
    if (screenSharing) {
      stopTracks(screenRef.current)
      setScreenStream(null)
      screenRef.current = null
      setScreenSharing(false)
      try { setRoom(await updateVoiceState(cur.channelId, { screenSharing: false })) } catch { /* ignore */ }
      return
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaWarning('Screen sharing is not supported in this browser.')
      return
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const track = display.getVideoTracks()[0]
      track.onended = () => {
        setScreenStream(null)
        screenRef.current = null
        setScreenSharing(false)
        if (roomRef.current) updateVoiceState(roomRef.current.channelId, { screenSharing: false }).then(setRoom).catch(() => undefined)
      }
      setScreenStream(display)
      screenRef.current = display
      setScreenSharing(true)
      peersRef.current.forEach((pc) => pc.addTrack(track, display))
      await renegotiateAll(cur.channelId)
      setRoom(await updateVoiceState(cur.channelId, { screenSharing: true }))
    } catch {
      // User cancelled browser screen picker
    }
  }, [screenSharing, renegotiateAll])

  const value = useMemo<VoiceRoomApi>(() => ({
    room, micOn, camOn, screenSharing, localStream, screenStream, remoteStreams,
    mediaWarning, error, join, leave, toggleMic, toggleCam, toggleScreenShare, clearError: () => setError(null),
  }), [room, micOn, camOn, screenSharing, localStream, screenStream, remoteStreams,
    mediaWarning, error, join, leave, toggleMic, toggleCam, toggleScreenShare])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

const NOOP = async () => undefined
const FALLBACK: VoiceRoomApi = {
  room: null, micOn: false, camOn: false, screenSharing: false,
  localStream: null, screenStream: null, remoteStreams: {},
  mediaWarning: null, error: null, join: NOOP, leave: NOOP,
  toggleMic: NOOP, toggleCam: NOOP, toggleScreenShare: NOOP, clearError: () => undefined,
}

export function useVoiceRoom(): VoiceRoomApi {
  return useContext(Ctx) ?? FALLBACK
}
