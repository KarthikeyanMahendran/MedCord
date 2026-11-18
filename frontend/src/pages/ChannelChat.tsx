import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Hash, Megaphone, Pin, Send, ShieldOff, UserX, X } from 'lucide-react'
import { Alert, Badge, Button, Modal } from '../components/ui'
import { getCommunity, listChannels } from '../api/communities'
import type { Channel, Community } from '../api/communities'
import { PresenceDot } from '../components/chat/PresenceDot'
import { blockUser, getDm, listDms, unblockUser } from '../api/dms'
import type { Conversation } from '../api/dms'
import { MessageItem } from '../components/chat/MessageItem'
import { ThreadPanel } from '../components/chat/ThreadPanel'
import { deleteMessage, editMessage, listMessages, listPins, messageHistory, pinMessage, react, sendMessage, startThread, unpinMessage, unreact } from '../api/messages'
import type { Message, Revision } from '../api/messages'
import { problemMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'

const POLL_MS = 4000
const dayKey = (iso: string) => new Date(iso).toDateString()
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

export default function ChannelChat() {
  const { id = '', channelId = '' } = useParams()
  const dmMode = !id
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
  const [openThread, setOpenThread] = useState<string | null>(null)
  const [pins, setPins] = useState<Message[] | null>(null)
  const [convs, setConvs] = useState<Conversation[]>([])
  const [conv, setConv] = useState<Conversation | null>(null)
  const [history, setHistory] = useState<{ msg: Message; revs: Revision[] } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const channel = channels.find((c) => c.id === channelId)
  const perms = dmMode ? ['SEND_MESSAGES'] : (community?.myPermissions ?? [])
  const canPost = dmMode
    ? !!conv && !conv.blockedByMe && !conv.blockedByThem
    : !!channel && !channel.archived && perms.includes('SEND_MESSAGES') && (channel.type !== 'ANNOUNCEMENT' || perms.includes('POST_ANNOUNCEMENTS'))
  const moderator = !dmMode && perms.includes('MODERATE_MESSAGES')
  const otherPerson = conv && !conv.group ? conv.participants.find((p) => p.id !== user?.id) : undefined
  const title = dmMode ? (conv?.name ?? '…') : `# ${channel?.name ?? '…'}`

  useEffect(() => {
    if (dmMode) return
    Promise.all([getCommunity(id), listChannels(id)]).then(([c, ch]) => { setCommunity(c); setChannels(ch) }).catch((e) => setError(problemMessage(e)))
  }, [id, dmMode])

  useEffect(() => {
    if (!dmMode) return
    const load = () => listDms().then(setConvs).catch(() => undefined)
    void load()
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, 15000)
    return () => clearInterval(t)
  }, [dmMode])

  useEffect(() => {
    if (!dmMode || !channelId) { setConv(null); return }
    getDm(channelId).then(setConv).catch((e) => setError(problemMessage(e)))
  }, [dmMode, channelId])

  async function toggleBlock() {
    if (!otherPerson || !conv) return
    try {
      await (conv.blockedByMe ? unblockUser(otherPerson.id) : blockUser(otherPerson.id))
      setConv(await getDm(conv.id)); setError(null)
    } catch (e) { setError(problemMessage(e)) }
  }

  /** Merge a fresh page into state by id (new messages append; edits/deletes replace). */
  const merge = useCallback((incoming: Message[]) => {
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]))
      incoming.forEach((m) => map.set(m.id, m))
      return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    })
  }, [])

  useEffect(() => {
    setMessages([]); setLoading(!!channelId); setReplyTo(null); setEditing(null); setOpenThread(null); setText(''); stick.current = true
    if (!channelId) return
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

  const refreshTimeline = useCallback(() => { listMessages(channelId).then((p) => merge(p.items)).catch(() => undefined) }, [channelId, merge])

  async function openOrStartThread(m: Message) {
    if (m.thread) { setOpenThread(m.thread.id); return }
    try {
      const t = await startThread(m.id)
      merge([{ ...m, thread: { id: t.id, title: t.title, replyCount: 0, lastReplyAt: null, archived: false } }])
      setOpenThread(t.id)
    } catch (e) { setError(problemMessage(e)) }
  }

  async function toggleReaction(m: Message, emoji: string) {
    const had = m.reactions.some((r) => r.emoji === emoji && r.mine)
    try { merge([await (had ? unreact(m.id, emoji) : react(m.id, emoji))]) } catch (e) { setError(problemMessage(e)) }
  }

  async function togglePin(m: Message) {
    try { merge([await (m.pinned ? unpinMessage(m.id) : pinMessage(m.id))]) } catch (e) { setError(problemMessage(e)) }
  }

  async function showPins() {
    try { setPins(await listPins(channelId)) } catch (e) { setError(problemMessage(e)) }
  }

  const rows = useMemo(() => {
    let last = ''
    return messages.map((m) => { const k = dayKey(m.createdAt); const header = k !== last; last = k; return { m, header } })
  }, [messages])

  return (
    <div className={`mc-chat ${openThread ? 'has-thread' : ''}`}>
      <aside className="mc-chat-side" aria-label={dmMode ? 'Conversations' : 'Channels'}>
        {dmMode ? (<>
          <h2>Direct messages</h2>
          {convs.length === 0 && <span className="mc-hint" style={{ padding: '4px 8px' }}>No conversations yet. Open a community and message a member.</span>}
          {convs.map((c) => {
            const other = c.group ? undefined : c.participants.find((p) => p.id !== user?.id)
            return (
              <Link key={c.id} to={`/messages/${c.id}`} className={`mc-chan ${c.id === channelId ? 'active' : ''}`} aria-current={c.id === channelId ? 'page' : undefined}>
                {other ? <PresenceDot online={other.online} /> : <span className="mc-muted-sub">👥</span>}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  {c.lastMessage && <span className="mc-muted-sub" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 400 }}>{c.lastMessage.excerpt}</span>}
                </span>
              </Link>
            )
          })}
        </>) : (<>
          <Link to={`/communities/${id}`} className="mc-muted-sub" style={{ padding: '4px 8px' }}>← {community?.name ?? 'Community'}</Link>
          <h2>Channels</h2>
          {channels.map((c) => (
            <Link key={c.id} to={`/communities/${id}/channels/${c.id}`} className={`mc-chan ${c.id === channelId ? 'active' : ''}`} aria-current={c.id === channelId ? 'page' : undefined}>
              {c.type === 'ANNOUNCEMENT' ? <Megaphone size={15} /> : <Hash size={15} />}{c.name}{c.archived && <Badge tone="neutral">archived</Badge>}
            </Link>
          ))}
        </>)}
      </aside>

      <section className="mc-chat-main">
        <div className="mc-chat-head">
          <div className="mc-row">
            {dmMode && otherPerson && <PresenceDot online={otherPerson.online} />}
            <strong>{title}</strong>
            {!dmMode && channel?.topic && <span className="mc-muted-sub" style={{ marginLeft: 10 }}>{channel.topic}</span>}
            {dmMode && otherPerson && <span className="mc-muted-sub">{otherPerson.specialty}{otherPerson.verified ? ' · verified' : ''}</span>}
          </div>
          <div className="mc-row">
            {dmMode && otherPerson && <Button variant="ghost" size="sm" onClick={toggleBlock}>{conv?.blockedByMe ? <><ShieldOff size={14} /> Unblock</> : <><UserX size={14} /> Block</>}</Button>}
            {!dmMode && <Button variant="ghost" size="sm" onClick={showPins}><Pin size={14} /> Pinned</Button>}
          </div>
        </div>

        <div className="mc-msgs" ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }} role="log" aria-live="polite" aria-label="Messages">
          {hasMore && <div style={{ textAlign: 'center' }}><Button variant="ghost" size="sm" onClick={loadOlder}>Load earlier messages</Button></div>}
          {loading && <div className="mc-skeleton" style={{ height: 48, margin: 8 }} />}
          {!channelId && dmMode && <div className="mc-empty"><strong>Select a conversation</strong><p className="mc-hint">Or message someone from a community's member list.</p></div>}
          {!loading && channelId && messages.length === 0 && <div className="mc-empty"><strong>{dmMode ? `This is the start of your conversation with ${conv?.name ?? ''}` : `This is the start of #${channel?.name}`}</strong><p className="mc-hint">Say hello 👋</p></div>}
          {rows.map(({ m, header }) => (
            <div key={m.id}>
              {header && <div className="mc-day">{dayLabel(m.createdAt)}</div>}
              <MessageItem m={m} userId={user?.id} canPost={canPost} moderator={moderator}
                onReply={(x) => { setReplyTo(x); setEditing(null) }} onEdit={startEdit} onDelete={setConfirmDelete}
                onHistory={showHistory} onThread={openOrStartThread} onReact={toggleReaction} onPin={togglePin} />
            </div>
          ))}
        </div>

        <div className="mc-composer">
          {error && <Alert tone="danger">{error}</Alert>}
          {replyTo && <div className="mc-composer-bar"><span>Replying to <strong>{replyTo.author.displayName}</strong></span><Button variant="icon" size="sm" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><X size={14} /></Button></div>}
          {editing && <div className="mc-composer-bar"><span>Editing message · Esc to cancel</span><Button variant="icon" size="sm" aria-label="Cancel edit" onClick={() => { setEditing(null); setText('') }}><X size={14} /></Button></div>}
          {dmMode && conv && !canPost && <Alert tone="info">{conv.blockedByMe ? 'You blocked this person. Unblock to send messages.' : 'You can no longer message this person.'}</Alert>}
          {!dmMode && channel && !canPost
            ? <Alert tone="info">{channel.archived ? 'This channel is archived and read-only.' : channel.type === 'ANNOUNCEMENT' ? 'Only members with announcement permission can post here.' : 'You do not have permission to send messages.'}</Alert>
            : (
              <div className="mc-composer-row" hidden={!channelId || (dmMode && !canPost)}>
                <textarea className="mc-input" rows={1} aria-label="Message" placeholder={dmMode ? `Message ${conv?.name ?? ''}` : channel ? `Message #${channel.name}` : 'Message'} value={text}
                  onChange={(e) => setText(e.target.value)} onKeyDown={onKey} maxLength={4000} />
                <Button onClick={submit} loading={sending} disabled={!text.trim()} aria-label={editing ? 'Save edit' : 'Send'}><Send size={16} /></Button>
              </div>
            )}
        </div>
      </section>

      {openThread && <ThreadPanel threadId={openThread} userId={user?.id} canPost={canPost} moderator={moderator} onClose={() => setOpenThread(null)} onChanged={refreshTimeline} />}

      <Modal isOpen={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete message?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={doDelete}>Delete</Button></>}>
        The message will be removed for everyone. A copy is kept for moderation audit.
      </Modal>

      <Modal isOpen={pins !== null} onClose={() => setPins(null)} title="Pinned messages" size="md">
        {pins?.length === 0 && <div className="mc-empty"><strong>No pinned messages</strong><p className="mc-hint">Moderators can pin important messages from the message menu.</p></div>}
        <div style={{ display: 'grid', gap: 10 }}>
          {pins?.map((p) => (
            <div key={p.id} className="mc-rev"><div className="mc-muted-sub">{p.author.displayName} · {new Date(p.createdAt).toLocaleString()}</div><div className="mc-msg-body" style={{ marginTop: 4 }}>{p.body}</div></div>
          ))}
        </div>
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
