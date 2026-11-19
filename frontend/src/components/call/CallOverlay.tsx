import { useEffect, useRef, useState } from 'react'
import { Maximize2, Mic, MicOff, Minimize2, Monitor, MonitorOff, Phone, PhoneOff, Video, VideoOff, X } from 'lucide-react'
import { Avatar, Button } from '../ui'
import { useCall } from '../../context/CallContext'
import { useAuth } from '../../context/AuthContext'

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Everything call-related that floats above the app: incoming-call prompt, outgoing "calling…" card,
 * the in-call window (minimisable, survives navigation), and short end-of-call / error notices.
 */
export function CallOverlay() {
  const { user } = useAuth()
  const { state, error, lastEnded, screenStream, accept, decline, hangup, toggleMic, toggleCam, toggleScreenShare, bindVideo, dismiss } = useCall()
  const { phase, call, micOn, camOn, remoteCamOn, remoteMicOn, connectedAt, screenSharing } = state
  const localRef = useRef<HTMLVideoElement>(null)
  const remoteRef = useRef<HTMLVideoElement>(null)
  const screenRef = useRef<HTMLVideoElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Attach SDK media to our <video> elements whenever they (re)mount.
  useEffect(() => {
    if (phase === 'connected' || phase === 'outgoing') bindVideo(localRef.current, remoteRef.current)
  }, [phase, expanded, bindVideo])

  useEffect(() => {
    if (screenRef.current) screenRef.current.srcObject = screenStream ?? null
  }, [screenStream, expanded])

  useEffect(() => {
    if (phase !== 'connected') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => { if (phase === 'idle') setExpanded(false) }, [phase])

  const peer = call ? (call.caller.id === user?.id ? call.callee : call.caller) : null
  const video = call?.media === 'VIDEO'

  return (
    <>
      {(error || lastEnded) && phase === 'idle' && (
        <div className={`mc-call-toast ${error ? 'is-error' : ''}`} role="status">
          {error ? <PhoneOff size={15} /> : <Phone size={15} />}
          <span>{error ?? lastEnded}</span>
          {error && <Button variant="icon" size="sm" aria-label="Dismiss" onClick={dismiss}><X size={14} /></Button>}
        </div>
      )}

      {phase === 'incoming' && call && peer && (
        <div className="mc-call-backdrop">
          <div className="mc-call-incoming" role="alertdialog" aria-modal="true" aria-label={`Incoming ${video ? 'video' : 'voice'} call from ${peer.displayName}`}>
            <span className="mc-call-pulse"><Avatar name={peer.displayName} size="lg" /></span>
            <div style={{ textAlign: 'center' }}>
              <strong style={{ fontSize: 17 }}>{peer.displayName}</strong>
              <div className="mc-muted-sub" style={{ fontSize: 13, marginTop: 2 }}>Incoming {video ? 'video' : 'voice'} call…</div>
            </div>
            <div className="mc-call-actions">
              <button type="button" className="mc-call-btn is-decline" onClick={decline} aria-label="Decline call"><PhoneOff size={20} /></button>
              <button type="button" className="mc-call-btn is-accept" onClick={accept} aria-label="Accept call" autoFocus>{video ? <Video size={20} /> : <Phone size={20} />}</button>
            </div>
          </div>
        </div>
      )}

      {(phase === 'outgoing' || phase === 'connected') && call && peer && (
        <section className={`mc-call-window ${expanded ? 'is-expanded' : ''} ${video ? 'is-video' : 'is-audio'}`} aria-label={`Call with ${peer.displayName}`}>
          <header className="mc-call-head">
            <div className="mc-row" style={{ gap: 8, minWidth: 0 }}>
              <span className={`mc-call-dot ${phase === 'connected' ? 'is-live' : ''}`} aria-hidden="true" />
              <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peer.displayName}</strong>
              <span className="mc-muted-sub mc-num">{phase === 'connected' && connectedAt ? clock(now - connectedAt) : 'Calling…'}</span>
            </div>
            <Button variant="icon" size="sm" aria-label={expanded ? 'Shrink call window' : 'Expand call window'} onClick={() => setExpanded((v) => !v)}>
              {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </Button>
          </header>

          <div className="mc-call-stage">
            {/* Remote media element is always mounted so audio plays for voice calls too. */}
            <video ref={remoteRef} className="mc-call-remote" autoPlay playsInline hidden={!video || !remoteCamOn || phase !== 'connected'} />
            {(!video || !remoteCamOn || phase !== 'connected') && (
              <div className="mc-call-placeholder">
                <Avatar name={peer.displayName} size="lg" />
                {phase === 'connected' && !remoteMicOn && <span className="mc-muted-sub"><MicOff size={12} /> Muted</span>}
                {phase === 'connected' && video && !remoteCamOn && <span className="mc-muted-sub">Camera off</span>}
              </div>
            )}
            {video && <video ref={localRef} className="mc-call-local" autoPlay playsInline muted hidden={!camOn} aria-label="Your camera" />}
            {screenSharing && screenStream && <video ref={screenRef} className="mc-call-screen" autoPlay playsInline muted aria-label="Shared screen preview" />}
          </div>

          <footer className="mc-call-controls">
            {phase === 'connected' && (
              <>
                <button type="button" className={`mc-call-ctl ${micOn ? '' : 'is-off'}`} onClick={toggleMic} aria-pressed={!micOn} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} title={micOn ? 'Mute' : 'Unmute'}>
                  {micOn ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
                {video && (
                  <button type="button" className={`mc-call-ctl ${camOn ? '' : 'is-off'}`} onClick={toggleCam} aria-pressed={!camOn} aria-label={camOn ? 'Turn camera off' : 'Turn camera on'} title={camOn ? 'Camera off' : 'Camera on'}>
                    {camOn ? <Video size={18} /> : <VideoOff size={18} />}
                  </button>
                )}
                {toggleScreenShare && (
                  <button type="button" className={`mc-call-ctl ${screenSharing ? 'is-active-share' : ''}`} onClick={toggleScreenShare} aria-pressed={!!screenSharing} aria-label={screenSharing ? 'Stop sharing screen' : 'Share screen'} title={screenSharing ? 'Stop sharing' : 'Share screen'}>
                    {screenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
                  </button>
                )}
              </>
            )}
            <button type="button" className="mc-call-ctl is-hangup" onClick={hangup} aria-label={phase === 'connected' ? 'Hang up' : 'Cancel call'} title={phase === 'connected' ? 'Hang up' : 'Cancel'}>
              <PhoneOff size={18} />
            </button>
          </footer>
        </section>
      )}
    </>
  )
}
