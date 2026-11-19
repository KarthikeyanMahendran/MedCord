import { useEffect, useState } from 'react'
import { Download, FileText, Mic, ShieldCheck, Subtitles, ZoomIn } from 'lucide-react'
import { fetchAttachmentBlob, transcribeAttachment } from '../../api/messages'
import type { Attachment } from '../../api/messages'
import { Button, Modal } from '../ui'

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

const formatDur = (s?: number | null) =>
  s == null ? null : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function VoiceNoteTile({ a }: { a: Attachment }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string | null>(a.transcript ?? null)
  const [showTranscript, setShowTranscript] = useState<boolean>(!!a.transcript)
  const [transcribing, setTranscribing] = useState(false)

  useEffect(() => {
    setTranscript(a.transcript ?? null)
    if (a.transcript) setShowTranscript(true)
  }, [a.transcript])

  useEffect(() => {
    let alive = true
    let created: string | null = null
    fetchAttachmentBlob(a.id)
      .then((blob) => {
        if (!alive) return
        created = URL.createObjectURL(blob)
        setBlobUrl(created)
      })
      .catch(() => undefined)
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [a.id])

  async function handleTranscribe() {
    if (transcript) {
      setShowTranscript((v) => !v)
      return
    }
    setTranscribing(true)
    try {
      const updated = await transcribeAttachment(a.id)
      setTranscript(updated.transcript ?? null)
      setShowTranscript(true)
    } catch {
      /* ignore transient errors */
    } finally {
      setTranscribing(false)
    }
  }

  return (
    <div className="mc-att-voice-card" aria-label="Voice note">
      <div className="mc-att-voice-top">
        <span className="mc-att-voice-badge"><Mic size={13} /> HD Voice Note</span>
        {formatDur(a.durationSeconds) && <span className="mc-muted-sub">{formatDur(a.durationSeconds)}</span>}
        <span className="mc-muted-sub">{formatSize(a.sizeBytes)}</span>
        <Button variant="ghost" size="sm" loading={transcribing} onClick={handleTranscribe}
          aria-label={transcript ? (showTranscript ? 'Hide transcript' : 'Show transcript') : 'Transcribe voice note'}>
          <Subtitles size={13} /> {transcript ? (showTranscript ? 'Hide text' : 'Transcript') : 'Transcribe'}
        </Button>
      </div>
      {blobUrl ? (
        <audio controls preload="metadata" src={blobUrl} className="mc-att-audio" />
      ) : (
        <div className="mc-muted-sub">Loading audio…</div>
      )}
      {showTranscript && transcript && (
        <div className="mc-voice-transcript">
          <div className="mc-voice-transcript-head">
            <Subtitles size={11} /> Speech-to-Text
            <span className="mc-att-exif"><ShieldCheck size={10} /> PHI-safe</span>
          </div>
          <p>{transcript}</p>
        </div>
      )}
    </div>
  )
}

function AttachmentTile({ a, onPreview }: { a: Attachment; onPreview: (url: string, a: Attachment) => void }) {
  const isImage = a.contentType.startsWith('image/')
  const isAudio = a.contentType.startsWith('audio/')
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!isImage) return
    let alive = true
    let created: string | null = null
    fetchAttachmentBlob(a.id)
      .then((blob) => {
        if (!alive) return
        created = URL.createObjectURL(blob)
        setBlobUrl(created)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [a.id, isImage])

  if (isAudio) {
    return <VoiceNoteTile a={a} />
  }

  async function downloadFile() {
    try {
      const blob = await fetchAttachmentBlob(a.id, true)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = a.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { /* ignore */ }
  }

  if (isImage) {
    return (
      <div className="mc-att-img-card">
        {blobUrl ? (
          <button type="button" className="mc-att-img-btn" onClick={() => onPreview(blobUrl, a)} aria-label={`Preview ${a.filename}`}>
            <img src={blobUrl} alt={a.filename} className="mc-att-thumb" />
            <span className="mc-att-zoom"><ZoomIn size={14} /></span>
          </button>
        ) : (
          <div className="mc-att-placeholder">{failed ? 'Image unavailable' : 'Loading image…'}</div>
        )}
        <div className="mc-att-meta">
          <span className="mc-att-name" title={a.filename}>{a.filename}</span>
          <span className="mc-muted-sub">{formatSize(a.sizeBytes)}</span>
          {a.exifStripped && (
            <span className="mc-att-exif" title="EXIF, GPS and camera metadata automatically stripped">
              <ShieldCheck size={11} /> EXIF stripped
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mc-att-file-card">
      <FileText size={18} className="mc-att-file-icon" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="mc-att-name" title={a.filename}>{a.filename}</div>
        <div className="mc-muted-sub">PDF · {formatSize(a.sizeBytes)}</div>
      </div>
      <Button variant="ghost" size="sm" aria-label={`Download ${a.filename}`} onClick={downloadFile}>
        <Download size={14} /> Download
      </Button>
    </div>
  )
}

export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  const [lightbox, setLightbox] = useState<{ url: string; a: Attachment } | null>(null)
  if (attachments.length === 0) return null

  async function downloadLightbox() {
    if (!lightbox) return
    const link = document.createElement('a')
    link.href = lightbox.url
    link.download = lightbox.a.filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <>
      <div className="mc-att-grid">
        {attachments.map((a) => (
          <AttachmentTile key={a.id} a={a} onPreview={(url, item) => setLightbox({ url, a: item })} />
        ))}
      </div>

      <Modal isOpen={lightbox !== null} onClose={() => setLightbox(null)} title={lightbox?.a.filename ?? 'Image preview'} size="lg"
        footer={lightbox && (
          <div className="mc-row" style={{ width: '100%', justifyContent: 'space-between' }}>
            <span className="mc-muted-sub">
              {lightbox.a.width && lightbox.a.height ? `${lightbox.a.width}×${lightbox.a.height} · ` : ''}
              {formatSize(lightbox.a.sizeBytes)}
              {lightbox.a.exifStripped ? ' · EXIF metadata stripped' : ''}
            </span>
            <Button variant="secondary" size="sm" onClick={downloadLightbox}><Download size={14} /> Download</Button>
          </div>
        )}>
        {lightbox && (
          <div className="mc-lightbox-body">
            <img src={lightbox.url} alt={lightbox.a.filename} />
          </div>
        )}
      </Modal>
    </>
  )
}
