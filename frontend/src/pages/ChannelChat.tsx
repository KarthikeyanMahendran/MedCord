import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowUp, Hash, Megaphone, MessageCircle, Phone, Pin, ShieldOff, UserX, Users, Video, X } from 'lucide-react'
import { Alert, Avatar, Button, EmptyState, FormGroup, Modal, Textarea, VerifiedMark } from '../components/ui'
import { PresenceDot } from '../components/chat/PresenceDot'
import { MessageItem } from '../components/chat/MessageItem'
import { ThreadPanel } from '../components/chat/ThreadPanel'
import { getCommunity, listChannels, listMembers } from '../api/communities'
import type { Channel, Community, Member } from '../api/communities'
import { blockUser, getDm, unblockUser } from '../api/dms'
import type { Conversation } from '../api/dms'
import { deleteMessage, editMessage, listMessages, listPins, messageHistory, pinMessage, react, sendMessage, startThread, unpinMessage, unreact } from '../api/messages'
import type { Message, Revision } from '../api/messages'
import { REPORT_REASONS, reportMessage } from '../api/moderation'
import type { ReportReason } from '../api/moderation'
import { problemMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useCall } from '../context/CallContext'

const POLL_MS = 4000
const dayKey = (iso: string) => new Date(iso).toDateString()
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
const GROUP_WINDOW_MS = 5 * 60 * 1000

/** Message pane for a community channel (`/communities/:id/channels/:channelId`) or a DM (`/messages/:channelId`). The sidebar lives in the app shell. */
export default function ChannelChat() {
  const { id = '', channelId = '' } = useParams()
  const dmMode = !id
  const { user } = useAuth()
  const calls = useCall()
  const [community, setCommunity] = useState<Community | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [showMembers, setShowMembers] = useState(true)
  const [conv, setConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(!!channelId)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)
  const [sending, setSending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null)
  const [openThread, setOpenThread] = useState<string | null>(null)
  const [pins, setPins] = useState<Message[] | null>(null)
  const [reporting, setReporting] = useState<Message | null>(null)
  const [reason, setReason] = useState<ReportReason>('PHI')
  const [details, setDetails] = useState('')
  const [history, setHistory] = useState<{ msg: Message; revs: Revision[] } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const stick = useRef(true)

  const channel = channels.find((c) => c.id === channelId)
  const perms = dmMode ? ['SEND_MESSAGES'] : (community?.myPermissions ?? [])
  const canPost = dmMode
    ? !!conv && !conv.blockedByMe && !conv.blockedByThem
    : !!channel && !channel.archived && perms.includes('SEND_MESSAGES') && (channel.type !== 'ANNOUNCEMENT' || perms.includes('POST_ANNOUNCEMENTS'))
  const moderator = !dmMode && perms.includes('MODERATE_MESSAGES')
  const otherPerson = conv && !conv.group ? conv.participants.find((p) => p.id !== user?.id) : undefined

  useEffect(() => {
    if (dmMode) return
    Promise.all([getCommunity(id), listChannels(id)]).then(([c, ch]) => { setCommunity(c); setChannels(ch) }).catch((e) => setError(problemMessage(e)))
  }, [id, dmMode])

  useEffect(() => {
    if (dmMode || !showMembers) return
    const load = () => listMembers(id).then(setMembers).catch(() => undefined)
    void load()
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, 30000)
    return () => clearInterval(t)
  }, [id, dmMode, showMembers])

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
    setMessages([]); setLoading(!!channelId); setReplyTo(null); setEditing(null); setOpenThread(null); setText(''); setNotice(null); stick.current = true
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

  // Auto-grow the composer up to its max height.
  useLayoutEffect(() => {
    const el = composer.current
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 180)}px` }
  }, [text])

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

  function startEdit(m: Message) { setEditing(m); setReplyTo(null); setText(m.body ?? ''); composer.current?.focus() }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() }
    else if (e.key === 'Escape') { setEditing(null); setReplyTo(null); setText('') }
    else if (e.key === 'ArrowUp' && text === '' && !editing) {
      const mine = [...messages].reverse().find((m) => m.author.id === user?.id && !m.deleted)
      if (mine) { e.preventDefault(); startEdit(mine) }
    }
  }

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

  async function submitReport() {
    if (!reporting) return
    try { await reportMessage(reporting.id, reason, details || undefined); setNotice('Thanks — moderators will review this message.'); setReporting(null); setDetails('') }
    catch (e) { setError(problemMessage(e)); setReporting(null) }
  }

  const rows = useMemo(() => {
    let lastDay = ''
    return messages.map((m, i) => {
      const k = dayKey(m.createdAt)
      const header = k !== lastDay
      lastDay = k
      const prev = messages[i - 1]
      const compact = !header && !!prev && prev.author.id === m.author.id && !prev.deleted && !m.replyTo && !prev.thread
        && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS
      return { m, header, compact }
    })
  }, [messages])

  const online = members.filter((m) => m.online)
  const offline = members.filter((m) => !m.online)
  const memberRow = (m: Member) => (
    <div key={m.userId} className={`mc-member ${m.online ? '' : 'is-offline'}`}>
      <span className="mc-member-avatar"><Avatar name={m.displayName} size="sm" /><PresenceDot online={m.online} /></span>
      <span style={{ minWidth: 0 }}>
        <span className="mc-member-name"><span>{m.displayName}</span>{m.verified && <VerifiedMark size={13} />}</span>
        <span className="mc-member-sub">{m.roles.find((r) => r.name !== 'Member')?.name ?? m.specialty ?? ''}</span>
      </span>
    </div>
  )

  return (
    <div className="mc-chat">
      <section className="mc-chat-main">
        <div className="mc-chat-head">
          <div className="mc-chat-title">
            {dmMode
              ? (<>{otherPerson
                    ? <span className="mc-member-avatar"><Avatar name={otherPerson.displayName} size="sm" /><PresenceDot online={otherPerson.online} /></span>
                    : conv ? <Users size={18} /> : <MessageCircle size={18} />}
                  <strong>{conv?.name ?? (channelId ? '…' : 'Direct messages')}</strong>
                  {otherPerson?.verified && <VerifiedMark />}
                  {otherPerson && <span className="mc-chat-topic">{otherPerson.specialty ?? ''}{otherPerson.online ? ' · Online' : ' · Offline'}</span>}
                  {conv?.group && <span className="mc-chat-topic">{conv.participants.length} members</span>}</>)
              : (<>{channel?.type === 'ANNOUNCEMENT' ? <Megaphone size={18} /> : <Hash size={18} />}<strong>{channel?.name ?? '…'}</strong>
                  {channel?.topic && <span className="mc-chat-topic">{channel.topic}</span>}</>)}
          </div>
          <div className="mc-chat-actions">
            {dmMode && otherPerson && conv && (() => {
              const why = conv.blockedByMe || conv.blockedByThem ? 'Calling is unavailable in this conversation'
                : !calls.ready ? 'Calling is connecting…' : calls.state.phase !== 'idle' ? 'You are already in a call' : null
              return (<>
                <Button variant="icon" aria-label="Start voice call" title={why ?? 'Start voice call'} disabled={!!why} onClick={() => calls.startCall(conv.id, 'AUDIO')}><Phone size={17} /></Button>
                <Button variant="icon" aria-label="Start video call" title={why ?? 'Start video call'} disabled={!!why} onClick={() => calls.startCall(conv.id, 'VIDEO')}><Video size={18} /></Button>
              </>)
            })()}
            {dmMode && otherPerson && <Button variant="ghost" size="sm" onClick={toggleBlock}>{conv?.blockedByMe ? <><ShieldOff size={14} /> Unblock</> : <><UserX size={14} /> Block</>}</Button>}
            {!dmMode && <Button variant="icon" aria-label="Pinned" onClick={showPins}><Pin size={17} /></Button>}
            {!dmMode && <Button variant="icon" aria-label={showMembers ? 'Hide member list' : 'Show member list'} aria-pressed={showMembers} onClick={() => setShowMembers((v) => !v)}><Users size={17} /></Button>}
          </div>
        </div>

        <div className="mc-msgs" ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }} role="log" aria-live="polite" aria-label="Messages">
          {hasMore && <div style={{ textAlign: 'center' }}><Button variant="ghost" size="sm" onClick={loadOlder}>Load earlier messages</Button></div>}
          {loading && [0, 1, 2].map((i) => (
            <div key={i} className="mc-msg-skel" aria-hidden="true">
              <span className="mc-skeleton is-avatar" />
              <span style={{ display: 'grid', gap: 8, paddingTop: 4 }}><span className="mc-skeleton" style={{ width: 140 }} /><span className="mc-skeleton" style={{ width: `${70 - i * 15}%` }} /></span>
            </div>
          ))}
          {!channelId && dmMode && (
            <div style={{ margin: 'auto' }}>
              <EmptyState title="No conversation selected" icon={<MessageCircle size={18} />}>Pick a conversation on the left, or message a colleague from any community&apos;s member list.</EmptyState>
            </div>
          )}
          {!loading && channelId && !hasMore && (dmMode ? conv : channel) && (
            <div className="mc-intro">
              <div className="mc-intro-icon">{dmMode ? <MessageCircle size={22} /> : channel?.type === 'ANNOUNCEMENT' ? <Megaphone size={22} /> : <Hash size={22} />}</div>
              <h2>{dmMode ? conv?.name : `Welcome to #${channel?.name}`}</h2>
              <p>{dmMode ? 'This is the beginning of your direct message history.' : `This is the start of the #${channel?.name} channel.${channel?.topic ? ` ${channel.topic}.` : ''}`}</p>
            </div>
          )}
          {rows.map(({ m, header, compact }) => (
            <div key={m.id}>
              {header && <div className="mc-day">{dayLabel(m.createdAt)}</div>}
              <MessageItem m={m} compact={compact} userId={user?.id} canPost={canPost} moderator={moderator}
                onReply={(x) => { setReplyTo(x); setEditing(null); composer.current?.focus() }} onEdit={startEdit} onDelete={setConfirmDelete}
                onHistory={showHistory} onThread={openOrStartThread} onReact={toggleReaction} onPin={togglePin} onReport={dmMode ? undefined : setReporting} />
            </div>
          ))}
        </div>

        <div className="mc-composer">
          {notice && <Alert tone="success">{notice}</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}
          {replyTo && <div className="mc-composer-bar"><span>Replying to <strong>{replyTo.author.displayName}</strong></span><Button variant="icon" size="sm" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><X size={14} /></Button></div>}
          {editing && <div className="mc-composer-bar"><span>Editing message · Esc to cancel</span><Button variant="icon" size="sm" aria-label="Cancel edit" onClick={() => { setEditing(null); setText('') }}><X size={14} /></Button></div>}
          {dmMode && conv && !canPost && <Alert tone="info">{conv.blockedByMe ? 'You blocked this person. Unblock to send messages.' : 'You can no longer message this person.'}</Alert>}
          {!dmMode && channel && !canPost
            ? <Alert tone="info">{channel.archived ? 'This channel is archived and read-only.' : channel.type === 'ANNOUNCEMENT' ? 'Only members with announcement permission can post here.' : 'You do not have permission to send messages.'}</Alert>
            : (
              <div className="mc-composer-row" hidden={!channelId || (dmMode && !canPost)}>
                <textarea ref={composer} rows={1} aria-label="Message" placeholder={dmMode ? `Message ${conv?.name ?? ''}` : channel ? `Message #${channel.name}` : 'Message'}
                  value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} maxLength={4000} />
                <Button onClick={submit} loading={sending} disabled={!text.trim()} aria-label={editing ? 'Save edit' : 'Send'}><ArrowUp size={16} /></Button>
              </div>
            )}
          {channelId && canPost && (
            <div className="mc-composer-hint" aria-hidden="true">
              <span><b>Enter</b> to send</span><span><b>Shift + Enter</b> new line</span>{!editing && <span><b>↑</b> edit last</span>}<span><b>Esc</b> cancel</span>
            </div>
          )}
        </div>
      </section>

      {openThread && <ThreadPanel threadId={openThread} userId={user?.id} canPost={canPost} moderator={moderator} onClose={() => setOpenThread(null)} onChanged={refreshTimeline} />}

      {!dmMode && showMembers && !openThread && (
        <aside className="mc-panel mc-members" aria-label="Members">
          <div className="mc-side-label">Online — {online.length}</div>
          {online.map(memberRow)}
          <div className="mc-side-label">Offline — {offline.length}</div>
          {offline.map(memberRow)}
        </aside>
      )}

      <Modal isOpen={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete message?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={doDelete}>Delete</Button></>}>
        The message will be removed for everyone. A copy is kept for moderation audit.
      </Modal>

      <Modal isOpen={reporting !== null} onClose={() => setReporting(null)} title="Report message" size="sm"
        footer={<><Button variant="secondary" onClick={() => setReporting(null)}>Cancel</Button><Button onClick={submitReport}>Submit report</Button></>}>
        <div style={{ display: 'grid', gap: 12 }}>
          <FormGroup id="rreason" label="Why are you reporting this?">
            <select id="rreason" className="mc-input" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
              {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </FormGroup>
          <FormGroup id="rdetails" label="Details (optional)"><Textarea id="rdetails" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} /></FormGroup>
        </div>
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
