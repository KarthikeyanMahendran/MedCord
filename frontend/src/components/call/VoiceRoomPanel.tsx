import { useEffect, useRef } from 'react'
import { Mic, MicOff, Monitor, MonitorOff, PhoneOff, Video, VideoOff, Volume2 } from 'lucide-react'
import type { VoiceParticipant, VoiceRoom } from '../../api/voiceRooms'
import { useAuth } from '../../context/AuthContext'
import { useVoiceRoom } from '../../context/VoiceRoomContext'
import { Alert, Avatar, Badge, Button, VerifiedMark } from '../ui'

function StreamVideo({ stream, muted, className }: { stream: MediaStream; muted?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />
}

function ParticipantTile({ p, isMe, stream }: { p: VoiceParticipant; isMe: boolean; stream?: MediaStream | null }) {
  const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
  return (
    <div className={`mc-voice-tile ${p.screenSharing ? 'is-sharing' : ''}`}>
      {stream && (
        <StreamVideo stream={stream} muted={isMe} className={`mc-voice-video ${hasVideo ? '' : 'is-hidden'}`} />
      )}
      {!hasVideo && (
        <div className="mc-voice-avatar">
          <Avatar name={p.displayName} size="lg" />
        </div>
      )}
      <div className="mc-voice-tile-bar">
        <span className="mc-voice-tile-name">
          <span>{p.displayName}{isMe ? ' (You)' : ''}</span>
          {p.verified && <VerifiedMark size={12} />}
        </span>
        <span className="mc-voice-tile-icons">
          {p.screenSharing && <Badge tone="info">Sharing</Badge>}
          {p.micOn ? <Mic size={13} /> : <MicOff size={13} className="is-muted" />}
          {p.camOn && <Video size={13} />}
        </span>
      </div>
    </div>
  )
}

/** Community voice/video room with multi-participant tiles & screen sharing spotlight. */
export function VoiceRoomPanel({ channelId, roomSnapshot }: { channelId: string; roomSnapshot: VoiceRoom | null }) {
  const { user } = useAuth()
  const voice = useVoiceRoom()
  const isJoinedHere = voice.room?.channelId === channelId
  const activeRoom = isJoinedHere ? voice.room : roomSnapshot
  const participants = activeRoom?.participants ?? []

  const screenPeer = participants.find((p) => p.screenSharing)
  const spotlightStream = isJoinedHere
    ? (screenPeer?.userId === user?.id ? voice.screenStream : (screenPeer ? voice.remoteStreams[screenPeer.userId] : null))
    : null

  return (
    <section className="mc-voice-panel" aria-label="Voice room">
      {voice.error && <Alert tone="danger">{voice.error}</Alert>}
      {voice.mediaWarning && isJoinedHere && <Alert tone="info">{voice.mediaWarning}</Alert>}

      {!isJoinedHere ? (
        <div className="mc-voice-lobby">
          <div className="mc-voice-lobby-icon"><Volume2 size={28} /></div>
          <h3>{activeRoom?.name ?? 'Voice room'}</h3>
          <p className="mc-muted-sub">
            {activeRoom?.topic ?? 'Live audio, video, and screen sharing for de-identified clinical discussions and journal clubs.'}
          </p>
          {participants.length > 0 && (
            <div className="mc-voice-lobby-who">
              {participants.map((p) => (
                <span key={p.userId} className="mc-voice-chip">
                  <Avatar name={p.displayName} size="sm" />
                  <span>{p.displayName}</span>
                </span>
              ))}
            </div>
          )}
          <div className="mc-row" style={{ gap: 8, marginTop: 8 }}>
            <Button onClick={() => voice.join(channelId, { micOn: true, camOn: false })} disabled={activeRoom?.archived}>
              <Volume2 size={15} /> Join voice
            </Button>
            <Button variant="secondary" onClick={() => voice.join(channelId, { micOn: true, camOn: true })} disabled={activeRoom?.archived}>
              <Video size={15} /> Join with video
            </Button>
          </div>
        </div>
      ) : (
        <>
          {spotlightStream && screenPeer && (
            <div className="mc-voice-spotlight">
              <div className="mc-voice-spotlight-badge">
                <Monitor size={13} /> {screenPeer.userId === user?.id ? 'You are sharing your screen' : `${screenPeer.displayName}'s screen`}
              </div>
              <StreamVideo stream={spotlightStream} muted={screenPeer.userId === user?.id} className="mc-voice-spotlight-video" />
            </div>
          )}

          <div className="mc-voice-grid">
            {participants.map((p) => {
              const isMe = p.userId === user?.id
              const stream = isMe ? voice.localStream : voice.remoteStreams[p.userId]
              return <ParticipantTile key={p.userId} p={p} isMe={isMe} stream={stream} />
            })}
          </div>

          <div className="mc-voice-controls">
            <button type="button" className={`mc-call-ctl ${voice.micOn ? '' : 'is-off'}`} onClick={voice.toggleMic}
              aria-pressed={!voice.micOn} aria-label={voice.micOn ? 'Mute microphone' : 'Unmute microphone'} title={voice.micOn ? 'Mute' : 'Unmute'}>
              {voice.micOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button type="button" className={`mc-call-ctl ${voice.camOn ? '' : 'is-off'}`} onClick={voice.toggleCam}
              aria-pressed={voice.camOn} aria-label={voice.camOn ? 'Turn camera off' : 'Turn camera on'} title={voice.camOn ? 'Camera off' : 'Camera on'}>
              {voice.camOn ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button type="button" className={`mc-call-ctl ${voice.screenSharing ? 'is-active-share' : ''}`} onClick={voice.toggleScreenShare}
              aria-pressed={voice.screenSharing} aria-label={voice.screenSharing ? 'Stop sharing screen' : 'Share screen'} title={voice.screenSharing ? 'Stop sharing' : 'Share screen'}>
              {voice.screenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
            </button>
            <button type="button" className="mc-call-ctl is-hangup" onClick={voice.leave} aria-label="Leave voice room" title="Leave voice room">
              <PhoneOff size={18} />
            </button>
          </div>
        </>
      )}
    </section>
  )
}
