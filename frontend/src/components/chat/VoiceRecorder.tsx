import { useEffect, useRef, useState } from 'react'
import { Mic, Send, ShieldCheck, Square, Trash2 } from 'lucide-react'
import { Button } from '../ui'
import { isBrowserSpeechSupported, startLiveSpeechCapture } from '../../utils/nexconnFeatures'
import { scanPhi } from '../../utils/phiDetector'

export interface RecordedVoiceNote {
  file: File
  durationSeconds: number
  transcript: string
}

interface Props {
  disabled?: boolean
  blockedTerms?: string[]
  onSend: (note: RecordedVoiceNote) => Promise<void>
  onError: (msg: string) => void
}

const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * Hands-free HD voice note recorder with live speech-to-text capture and PHI-safe preview.
 * Produces an audio/webm or audio/ogg File ready for MedCord upload + Nexconn HD voice / STT.
 */
export function VoiceRecorder({ disabled, blockedTerms = [], onSend, onError }: Props) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [busy, setBusy] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const stopSttRef = useRef<(() => void) | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<number>(0)
  const transcriptRef = useRef<string>('')
  const cancelFlagRef = useRef<boolean>(false)

  transcriptRef.current = liveTranscript

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    stopSttRef.current?.()
    stopSttRef.current = null
    streamRef.current?.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
    streamRef.current = null
    recorderRef.current = null
  }

  useEffect(() => cleanup, [])

  async function start() {
    if (disabled || recording || busy) return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('Voice recording is not supported in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      cancelFlagRef.current = false
      setLiveTranscript('')
      setSeconds(0)

      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4']
        .find((m) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m))
      const rec = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream)
      recorderRef.current = rec

      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }

      rec.onstop = async () => {
        const wasCancelled = cancelFlagRef.current
        const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
        const rawMime = (rec.mimeType || preferred || 'audio/webm').split(';')[0]
        const ext = rawMime.includes('ogg') ? 'ogg' : rawMime.includes('mp4') ? 'm4a' : 'webm'
        const blob = new Blob(chunksRef.current, { type: rawMime })
        const rawTranscript = transcriptRef.current.trim()
        cleanup()
        setRecording(false)
        setSeconds(0)
        setLiveTranscript('')
        if (wasCancelled || blob.size === 0) return

        // Scrub any accidental PHI from live speech-to-text before sending
        const cleanTranscript = rawTranscript ? scanPhi(rawTranscript, blockedTerms).redactedText : ''
        const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type: rawMime })
        setBusy(true)
        try {
          await onSend({ file, durationSeconds: duration, transcript: cleanTranscript })
        } finally {
          setBusy(false)
        }
      }

      startedAtRef.current = Date.now()
      rec.start(250)
      setRecording(true)
      timerRef.current = setInterval(() => {
        setSeconds(Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)))
      }, 500)
      if (isBrowserSpeechSupported()) {
        stopSttRef.current = startLiveSpeechCapture((txt) => setLiveTranscript(txt))
      }
    } catch {
      cleanup()
      onError('Microphone access was denied or unavailable.')
    }
  }

  function cancel() {
    cancelFlagRef.current = true
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    } else {
      cleanup()
      setRecording(false)
    }
  }

  function finishAndSend() {
    cancelFlagRef.current = false
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }

  if (!recording) {
    return (
      <Button
        variant="icon"
        size="sm"
        aria-label="Record voice note"
        title="Record HD voice note with live Speech-to-Text"
        disabled={disabled || busy}
        onClick={start}
      >
        <Mic size={16} />
      </Button>
    )
  }

  const phiHit = liveTranscript ? scanPhi(liveTranscript, blockedTerms) : null

  return (
    <div className="mc-voice-recorder" role="region" aria-label="Recording voice note">
      <span className="mc-voice-dot" aria-hidden="true" />
      <span className="mc-voice-timer">{fmtDuration(seconds)}</span>
      <span className="mc-voice-live">
        {liveTranscript ? (
          <>
            {phiHit?.hasPhi ? phiHit.redactedText : liveTranscript}
            {phiHit?.hasPhi && <span className="mc-att-exif"><ShieldCheck size={10} /> PHI scrubbed</span>}
          </>
        ) : (
          <span className="mc-muted-sub">
            {isBrowserSpeechSupported() ? 'Recording HD voice note · Listening for transcript…' : 'Recording HD voice note…'}
          </span>
        )}
      </span>
      <Button variant="icon" size="sm" aria-label="Cancel voice recording" title="Discard recording" onClick={cancel}>
        <Trash2 size={15} />
      </Button>
      <Button size="sm" aria-label="Send voice note" title="Stop and send voice note" onClick={finishAndSend}>
        <Square size={11} fill="currentColor" /> <Send size={13} /> Send
      </Button>
    </div>
  )
}
