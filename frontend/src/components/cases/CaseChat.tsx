import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Languages, Mic, Send, Square, Volume2 } from 'lucide-react'
import { Button } from '../ui'
import { listMessages, sendMessage } from '../../api/messages'
import type { Message } from '../../api/messages'
import { problemMessage } from '../../api/client'
import { useDictation } from '../../lib/useDictation'
import { speakSmart, translateText } from '../../lib/sarvam'
import { connectNexconn, onChannelSignal, onNexconnStatus, signalPeer } from '../../lib/nexconn'
import type { NexconnStatus } from '../../lib/nexconn'

const POLL_MS = 4000          // slow safety net; Nexconn delivers new messages instantly
const POLL_LIVE_MS = 20000

/** Compact chat for a case room. Messages go through the backend; read-aloud uses the browser's speech engine. */
export function CaseChat({ channelId, lang, meId, peerId, readOnly }: { channelId: string; lang: string; meId: string; peerId?: string | null; readOnly?: boolean }) {
  const [live, setLive] = useState<NexconnStatus>('off')
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const count = useRef(0)

  const load = useCallback(async () => {
    try {
      const page = await listMessages(channelId, undefined, 100)
      setMessages(page.items)   // the API already returns oldest first
    } catch { /* keep what we have; the next poll retries */ }
  }, [channelId])

  useEffect(() => { void connectNexconn(); return onNexconnStatus(setLive) }, [])
  useEffect(() => onChannelSignal((ch) => { if (ch === channelId) void load() }), [channelId, load])

  useEffect(() => {
    void load()
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, live === 'live' ? POLL_LIVE_MS : POLL_MS)
    return () => { clearInterval(t); stopRef.current?.() }
  }, [load, live])

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
    try { await sendMessage(channelId, body); setText(''); void signalPeer(peerId, channelId); await load() } catch (err) { setError(problemMessage(err)) } finally { setSending(false) }
  }

  const textRef = useRef(text)
  textRef.current = text
  const voice = useDictation(lang, () => textRef.current, setText)
  const [translated, setTranslated] = useState<Record<string, string>>({})
  const [translating, setTranslating] = useState<string | null>(null)

  async function translate(id: string, body: string) {
    if (translated[id]) { setTranslated(({ [id]: _drop, ...rest }) => rest); return }
    setTranslating(id); setError(null)
    try { setTranslated((t) => ({ ...t, [id]: '' })); const out = await translateText(body, lang); setTranslated((t) => ({ ...t, [id]: out })) }
    catch (err) { setTranslated(({ [id]: _drop, ...rest }) => rest); setError(problemMessage(err)) } finally { setTranslating(null) }
  }

  return (
    <div className="mc-casechat">
      <div className={`mc-live mc-live-${live}`} role="status">{live === 'live' ? '● Live with Nexconn' : live === 'connecting' ? 'Connecting…' : 'Updating every few seconds'}</div>
      <div className="mc-casechat-msgs" ref={scroller} aria-live="polite">
        {messages.length === 0 && <p className="mc-muted-sub" style={{ padding: 16 }}>No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`mc-bubble ${m.author.id === meId ? 'is-me' : ''}`}>
            <div className="mc-bubble-meta">
              <strong>{m.author.displayName}</strong>
              <span>{new Date(m.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
              {m.body && !m.deleted && (
                <>
                  <button type="button" className="mc-bubble-speak" aria-label="Read aloud" title="Read aloud" onClick={() => void speakSmart(m.body ?? '', lang)}><Volume2 size={14} /></button>
                  <button type="button" className="mc-bubble-speak" aria-label="Translate to my language" title="Translate to my language" onClick={() => void translate(m.id, m.body ?? '')}><Languages size={14} /></button>
                </>
              )}
            </div>
            <p>{m.deleted ? 'Message deleted' : m.body}</p>
            {translated[m.id] !== undefined && <p className="mc-bubble-translated">{translating === m.id && !translated[m.id] ? 'Translating…' : translated[m.id]}</p>}
          </div>
        ))}
      </div>
      {(error || voice.error) && <p className="mc-casechat-error" role="alert">{error ?? voice.error}</p>}
      {!readOnly && (
        <form className="mc-casechat-form" onSubmit={send}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" rows={2} aria-label="Message"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
          <div className="mc-casechat-btns">
            {voice.available && (
              <Button variant="icon" aria-label={voice.listening ? 'Stop dictation' : 'Dictate message'} disabled={voice.working} onClick={() => void voice.toggle()}>
                {voice.listening ? <Square size={16} /> : voice.working ? <span aria-hidden="true">…</span> : <Mic size={16} />}
              </Button>
            )}
            <Button type="submit" loading={sending} disabled={!text.trim()} aria-label="Send"><Send size={15} /></Button>
          </div>
        </form>
      )}
    </div>
  )
}
