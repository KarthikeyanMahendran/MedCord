import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CornerUpLeft, Hash, History, Megaphone, Pencil, Send, Trash2, X } from 'lucide-react'
import { Alert, Badge, Button, Modal } from '../components/ui'
import { getCommunity, listChannels } from '../api/communities'
import type { Channel, Community } from '../api/communities'
import { deleteMessage, editMessage, listMessages, messageHistory, sendMessage } from '../api/messages'
import type { Message, Revision } from '../api/messages'
import { problemMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'

const POLL_MS = 4000
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const dayKey = (iso: string) => new Date(iso).toDateString()
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

export default function ChannelChat() {
  const { id = '', channelId = '' } = useParams()
  const { user } = useAuth()
  const [community, setCommunity] = useState<Community | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)
  const [sending, setSending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null)
  const [history, setHistory] = useState<{ msg: Message; revs: Revision[] } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const channel = channels.find((c) => c.id === channelId)
  const perms = community?.myPermissions ?? []
  const canPost = !!channel && !channel.archived && perms.includes('SEND_MESSAGES')
    && (channel.type !== 'ANNOUNCEMENT' || perms.includes('POST_ANNOUNCEMENTS'))
  const moderator = perms.includes('MODERATE_MESSAGES')

  useEffect(() => {
    Promise.all([getCommunity(id), listChannels(id)]).then(([c, ch]) => { setCommunity(c); setChannels(ch) }).catch((e) => setError(problemMessage(e)))
  }, [id])

  /** Merge a fresh page into state by id (new messages append; edits/deletes replace). */
  const merge = useCallback((incoming: Message[]) => {
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]))
      incoming.forEach((m) => map.set(m.id, m))
      return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    })
  }, [])

  useEffect(() => {
    setMessages([]); setLoading(true); setReplyTo(null); setEditing(null); setText(''); stick.current = true
    let alive = true
    listMessages(channelId).then((p) => { if (alive) { setMessages(p.items); setHasMore(p.hasMore); setError(null) } })
      .catch((e) => alive && setError(problemMessage(e))).finally(() => alive && setLoading(false))
    const t = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      listMessages(channelId).then((p) => alive && merge(p.items)).catch(() => undefined)
    }, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [channelId, merge])

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages])

  async function loadOlder() {
    if (messages.length === 0) return
    const el = scroller.current
    const prevHeight = el?.scrollHeight ?? 0
    try {
      const p = await listMessages(channelId, messages[0].id)
      stick.current = false
      merge(p.items); setHasMore(p.hasMore)
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight })
    } catch (e) { setError(problemMessage(e)) }
  }

  async function submit() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true); setError(null)
    try {
      if (editing) {
        merge([await editMessage(editing.id, body)]); setEditing(null)
      } else {
        stick.current = true
        merge([await sendMessage(channelId, body, replyTo?.id)]); setReplyTo(null)
      }
      setText('')
    } catch (e) { setError(problemMessage(e)) } finally { setSending(false) }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() }
    else if (e.key === 'Escape') { setEditing(null); setReplyTo(null); setText('') }
    else if (e.key === 'ArrowUp' && text === '' && !editing) {
      const mine = [...messages].reverse().find((m) => m.author.id === user?.id && !m.deleted)
      if (mine) { e.preventDefault(); startEdit(mine) }
    }
  }

  function startEdit(m: Message) { setEditing(m); setReplyTo(null); setText(m.body ?? '') }

  async function doDelete() {
    if (!confirmDelete) return
    try { await deleteMessage(confirmDelete.id); merge([{ ...confirmDelete, deleted: true, body: null }]); setConfirmDelete(null) }
    catch (e) { setError(problemMessage(e)); setConfirmDelete(null) }
  }

  async function showHistory(m: Message) {
    try { setHistory({ msg: m, revs: await messageHistory(m.id) }) } catch (e) { setError(problemMessage(e)) }
  }

  const rows = useMemo(() => {
    let last = ''
    return messages.map((m) => { const k = dayKey(m.createdAt); const header = k !== last; last = k; return { m, header } })
  }, [messages])

  return (
    <div className="mc-chat">
      <aside className="mc-chat-side" aria-label="Channels">
        <Link to={`/communities/${id}`} className="mc-muted-sub" style={{ padding: '4px 8px' }}>← {community?.name ?? 'Community'}</Link>
        <h2>Channels</h2>
        {channels.map((c) => (
          <Link key={c.id} to={`/communities/${id}/channels/${c.id}`} className={`mc-chan ${c.id === channelId ? 'active' : ''}`} aria-current={c.id === channelId ? 'page' : undefined}>
            {c.type === 'ANNOUNCEMENT' ? <Megaphone size={15} /> : <Hash size={15} />}{c.name}{c.archived && <Badge tone="neutral">archived</Badge>}
          </Link>
        ))}
      </aside>

      <section className="mc-chat-main">
        <div className="mc-chat-head">
          <div><strong># {channel?.name ?? '…'}</strong>{channel?.topic && <span className="mc-muted-sub" style={{ marginLeft: 10 }}>{channel.topic}</span>}</div>
        </div>

        <div className="mc-msgs" ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }} role="log" aria-live="polite" aria-label="Messages">
          {hasMore && <div style={{ textAlign: 'center' }}><Button variant="ghost" size="sm" onClick={loadOlder}>Load earlier messages</Button></div>}
          {loading && <div className="mc-skeleton" style={{ height: 48, margin: 8 }} />}
          {!loading && messages.length === 0 && <div className="mc-empty"><strong>This is the start of #{channel?.name}</strong><p className="mc-hint">Say hello 👋</p></div>}
          {rows.map(({ m, header }) => (
            <div key={m.id}>
              {header && <div className="mc-day">{dayLabel(m.createdAt)}</div>}
              <article className="mc-msg" aria-label={`Message from ${m.author.displayName}`}>
                <div className="mc-msg-avatar" aria-hidden="true">{initials(m.author.displayName)}</div>
                <div>
                  {m.replyTo && (
                    <div className="mc-quote"><CornerUpLeft size={12} /><strong>{m.replyTo.authorName}</strong><span>{m.replyTo.deleted ? 'Original message was deleted' : m.replyTo.excerpt}</span></div>
                  )}
                  <div className="mc-msg-meta">
                    <span className="mc-msg-name">{m.author.displayName}</span>
                    {m.author.verified && <Badge tone="success">verified</Badge>}
                    {m.author.specialty && <span className="mc-muted-sub">{m.author.specialty}</span>}
                    <span className="mc-msg-time">{time(m.createdAt)}</span>
                  </div>
                  {m.deleted
                    ? <div className="mc-msg-body mc-msg-deleted">This message was deleted.</div>
                    : <div className="mc-msg-body">{m.body}{m.editedAt && <span className="mc-edited" title={new Date(m.editedAt).toLocaleString()}>(edited)</span>}</div>}
                </div>
                {!m.deleted && (
                  <div className="mc-msg-tools" role="toolbar" aria-label="Message actions">
                    {canPost && <Button variant="icon" size="sm" aria-label="Reply" onClick={() => { setReplyTo(m); setEditing(null) }}><CornerUpLeft size={15} /></Button>}
                    {m.author.id === user?.id && canPost && <Button variant="icon" size="sm" aria-label="Edit" onClick={() => startEdit(m)}><Pencil size={15} /></Button>}
                    {m.editedAt && (m.author.id === user?.id || moderator) && <Button variant="icon" size="sm" aria-label="Edit history" onClick={() => showHistory(m)}><History size={15} /></Button>}
                    {(m.author.id === user?.id || moderator) && <Button variant="icon" size="sm" aria-label="Delete" onClick={() => setConfirmDelete(m)}><Trash2 size={15} /></Button>}
                  </div>
                )}
              </article>
            </div>
          ))}
        </div>

        <div className="mc-composer">
          {error && <Alert tone="danger">{error}</Alert>}
          {replyTo && <div className="mc-composer-bar"><span>Replying to <strong>{replyTo.author.displayName}</strong></span><Button variant="icon" size="sm" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><X size={14} /></Button></div>}
          {editing && <div className="mc-composer-bar"><span>Editing message · Esc to cancel</span><Button variant="icon" size="sm" aria-label="Cancel edit" onClick={() => { setEditing(null); setText('') }}><X size={14} /></Button></div>}
          {channel && !canPost
            ? <Alert tone="info">{channel.archived ? 'This channel is archived and read-only.' : channel.type === 'ANNOUNCEMENT' ? 'Only members with announcement permission can post here.' : 'You do not have permission to send messages.'}</Alert>
            : (
              <div className="mc-composer-row">
                <textarea className="mc-input" rows={1} aria-label="Message" placeholder={channel ? `Message #${channel.name}` : 'Message'} value={text}
                  onChange={(e) => setText(e.target.value)} onKeyDown={onKey} maxLength={4000} />
                <Button onClick={submit} loading={sending} disabled={!text.trim()} aria-label={editing ? 'Save edit' : 'Send'}><Send size={16} /></Button>
              </div>
            )}
        </div>
      </section>

      <Modal isOpen={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete message?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={doDelete}>Delete</Button></>}>
        The message will be removed for everyone. A copy is kept for moderation audit.
      </Modal>

      <Modal isOpen={history !== null} onClose={() => setHistory(null)} title="Edit history" size="md">
        <div style={{ display: 'grid', gap: 10 }}>
          {history?.revs.map((r) => (
            <div key={r.revisionNo} className="mc-rev">
              <div className="mc-muted-sub">Version {r.revisionNo} · {r.kind === 'DELETE' ? 'deleted' : 'replaced'} by {r.actorName} · {new Date(r.createdAt).toLocaleString()}</div>
              <div className="mc-msg-body" style={{ marginTop: 4 }}>{r.body}</div>
            </div>
          ))}
          {history && <div className="mc-rev" style={{ borderColor: 'var(--mc-brand)' }}><div className="mc-muted-sub">Current version</div><div className="mc-msg-body" style={{ marginTop: 4 }}>{history.msg.body}</div></div>}
        </div>
      </Modal>
    </div>
  )
}
