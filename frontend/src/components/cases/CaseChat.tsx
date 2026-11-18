import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Mic, Send, Square, Volume2 } from 'lucide-react'
import { Button } from '../ui'
import { listMessages, sendMessage } from '../../api/messages'
import type { Message } from '../../api/messages'
import { problemMessage } from '../../api/client'
import { canDictate, canSpeak, dictate, speak } from '../../lib/speech'

const POLL_MS = 4000

/** Compact chat for a case room. Messages go through the backend; read-aloud uses the browser's speech engine. */
export function CaseChat({ channelId, lang, meId, readOnly }: { channelId: string; lang: string; meId: string; readOnly?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [listening, setListening] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const count = useRef(0)

  const load = useCallback(async () => {
    try {
      const page = await listMessages(channelId, undefined, 100)
      setMessages(page.items)   // the API already returns oldest first
    } catch { /* keep what we have; the next poll retries */ }
  }, [channelId])

  useEffect(() => {
    void load()
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, POLL_MS)
    return () => { clearInterval(t); stopRef.current?.() }
  }, [load])

  useEffect(() => {
    if (messages.length !== count.current) {
      count.current = messages.length
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
    }
  }, [messages])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true); setError(null)
    try { await sendMessage(channelId, body); setText(''); await load() } catch (err) { setError(problemMessage(err)) } finally { setSending(false) }
  }

  function toggleMic() {
    if (listening) { stopRef.current?.(); return }
    const base = text ? text + ' ' : ''
    setListening(true); setError(null)
    stopRef.current = dictate(lang, (t) => setText(base + t), (err) => { setListening(false); if (err) setError(err) })
  }

  return (
    <div className="mc-casechat">
      <div className="mc-casechat-msgs" ref={scroller} aria-live="polite">
        {messages.length === 0 && <p className="mc-muted-sub" style={{ padding: 16 }}>No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`mc-bubble ${m.author.id === meId ? 'is-me' : ''}`}>
            <div className="mc-bubble-meta">
              <strong>{m.author.displayName}</strong>
              <span>{new Date(m.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
              {canSpeak() && m.body && !m.deleted && (
                <button type="button" className="mc-bubble-speak" aria-label="Read aloud" title="Read aloud" onClick={() => speak(m.body ?? '', lang)}><Volume2 size={14} /></button>
              )}
            </div>
            <p>{m.deleted ? 'Message deleted' : m.body}</p>
          </div>
        ))}
      </div>
      {error && <p className="mc-casechat-error" role="alert">{error}</p>}
      {!readOnly && (
        <form className="mc-casechat-form" onSubmit={send}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" rows={2} aria-label="Message"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
          <div className="mc-casechat-btns">
            {canDictate() && (
              <Button variant="icon" aria-label={listening ? 'Stop dictation' : 'Dictate message'} onClick={toggleMic}>
                {listening ? <Square size={16} /> : <Mic size={16} />}
              </Button>
            )}
            <Button type="submit" loading={sending} disabled={!text.trim()} aria-label="Send"><Send size={15} /></Button>
          </div>
        </form>
      )}
    </div>
  )
}
