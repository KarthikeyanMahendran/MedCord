import { useEffect, useRef, useState } from 'react'
import { CornerUpLeft, Flag, History, MessageSquareText, Pencil, Phone, PhoneMissed, Pin, PinOff, ShieldCheck, SmilePlus, Sparkles, Trash2, Video } from 'lucide-react'
import { Avatar, Badge, Button, VerifiedMark } from '../ui'
import type { Message } from '../../api/messages'
import { MarkdownBody } from './MarkdownBody'
import { AttachmentList } from './AttachmentView'

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const full = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })

export const QUICK_EMOJIS = ['👍', '❤️', '🎉', '🙏', '👀', '✅', '🩺', '😂']

export interface MessageItemProps {
  m: Message
  userId?: string
  canPost: boolean
  moderator: boolean
  /** Continues the previous author's run: hides avatar and name. */
  compact?: boolean
  /** True while an AI Co-Pilot message is actively streaming live tokens. */
  streaming?: boolean
  isUnread?: boolean
  onReply?: (m: Message) => void
  onEdit: (m: Message) => void
  onDelete: (m: Message) => void
  onHistory: (m: Message) => void
  onThread?: (m: Message) => void
  onReact?: (m: Message, emoji: string) => void
  onPin?: (m: Message) => void
  onReport?: (m: Message) => void
}

/** One message row with a hover toolbar. Shared by the channel timeline and the thread panel. */
export function MessageItem({ m, userId, canPost, moderator, compact, streaming, isUnread, onReply, onEdit, onDelete, onHistory, onThread, onReact, onPin, onReport }: MessageItemProps) {
  const [picker, setPicker] = useState(false)
  const pickerRef = useRef<HTMLSpanElement>(null)
  const mine = m.author.id === userId
  const isAi = m.kind === 'AI'
  const showHead = isAi || !compact || !!m.replyTo

  // Close the emoji picker on outside click or Escape.
  useEffect(() => {
    if (!picker) return
    const onDown = (e: MouseEvent) => { if (!pickerRef.current?.contains(e.target as Node)) setPicker(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicker(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [picker])

  const destructive = (mine || moderator)

  if (m.kind === 'CALL' && !m.deleted) {
    const missed = /^missed|declined|failed/i.test(m.body ?? '')
    const Icon = missed ? PhoneMissed : /video/i.test(m.body ?? '') ? Video : Phone
    return (
      <article className="mc-msg" aria-label={`Call record: ${m.body}`}>
        <div className="mc-msg-gutter"><Avatar name={m.author.displayName} size="md" /></div>
        <div>
          <div className="mc-msg-meta">
            <span className="mc-msg-name">{m.author.displayName}</span>
            <time className="mc-msg-time" dateTime={m.createdAt} title={full(m.createdAt)}>{time(m.createdAt)}</time>
          </div>
          <span className={`mc-call-record ${missed ? 'is-missed' : ''}`}><Icon size={14} />{m.body}</span>
        </div>
      </article>
    )
  }

  const editedTag = m.editedAt ? <span className="mc-edited" title={`Edited ${full(m.editedAt)}`}>(edited)</span> : null

  return (
    <article className={`mc-msg ${compact && !m.replyTo && !isAi ? 'is-compact' : ''} ${isAi ? 'is-ai' : ''} ${isUnread ? 'is-unread' : ''}`.trim()} aria-label={isAi ? 'Clinical Co-Pilot message' : `Message from ${m.author.displayName}`}>
      <div className="mc-msg-gutter">
        {isAi ? (
          <span className="mc-ai-avatar" aria-hidden="true"><Sparkles size={16} /></span>
        ) : showHead
          ? <Avatar name={m.author.displayName} size="md" />
          : <time className="mc-msg-hovertime" dateTime={m.createdAt} title={full(m.createdAt)}>{time(m.createdAt)}</time>}
      </div>
      <div>
        {m.replyTo && (
          <div className="mc-quote"><strong>{m.replyTo.authorName}</strong><span>{m.replyTo.deleted ? 'Original message was deleted' : m.replyTo.excerpt}</span></div>
        )}
        {showHead && (
          <div className="mc-msg-meta">
            {isAi ? (
              <>
                <span className="mc-msg-name">MedCord Clinical Co-Pilot</span>
                <span className="mc-ai-badge"><Sparkles size={10} /> AI Stream</span>
                <span className="mc-att-exif"><ShieldCheck size={10} /> De-identified</span>
                <span className="mc-msg-role">Requested by {m.author.displayName}</span>
                {streaming && <span className="mc-ai-streaming">Streaming live…</span>}
              </>
            ) : (
              <>
                <span className="mc-msg-name">{m.author.displayName}</span>
                {m.author.verified && <VerifiedMark />}
                {m.author.specialty && <span className="mc-msg-role">{m.author.specialty}</span>}
              </>
            )}
            <time className="mc-msg-time" dateTime={m.createdAt} title={full(m.createdAt)}>{time(m.createdAt)}</time>
            {m.pinned && <span className="mc-pinned-tag"><Pin size={11} /> pinned</span>}
          </div>
        )}
        {!showHead && m.pinned && <span className="mc-pinned-tag"><Pin size={11} /> pinned</span>}
        {m.deleted
          ? <div className="mc-msg-body mc-msg-deleted">This message was deleted.</div>
          : (
            <>
              {m.body && (
                <div className="mc-msg-body">
                  <MarkdownBody text={m.body} suffix={streaming ? <span className="mc-stream-cursor" aria-hidden="true" /> : editedTag} />
                </div>
              )}
              {!m.body && editedTag}
              {m.attachments && m.attachments.length > 0 && <AttachmentList attachments={m.attachments} />}
            </>
          )}
        {m.reactions.length > 0 && (
          <div className="mc-reactions" role="group" aria-label="Reactions">
            {m.reactions.map((r) => (
              <button key={r.emoji} type="button" className={`mc-reaction ${r.mine ? 'is-mine' : ''}`} aria-pressed={r.mine}
                aria-label={`${r.emoji} ${r.count} ${r.count === 1 ? 'reaction' : 'reactions'}${r.mine ? ', including yours' : ''}`}
                disabled={!onReact || !canPost} onClick={() => onReact?.(m, r.emoji)}>{r.emoji} <span>{r.count}</span></button>
            ))}
          </div>
        )}
        {m.thread && onThread && (
          <button type="button" className="mc-thread-chip" onClick={() => onThread(m)} aria-label={`Open thread, ${m.thread.replyCount} replies`}>
            <MessageSquareText size={13} />
            {m.thread.replyCount} {m.thread.replyCount === 1 ? 'reply' : 'replies'}
            {m.thread.lastReplyAt && <span>Last reply {time(m.thread.lastReplyAt)}</span>}
            {m.thread.archived && <Badge tone="neutral">Archived</Badge>}
          </button>
        )}
      </div>
      {!m.deleted && (
        <div className="mc-msg-tools" role="toolbar" aria-label="Message actions">
          {canPost && onReact && (
            <span ref={pickerRef} style={{ position: 'relative' }}>
              <Button variant="icon" size="sm" aria-label="Add reaction" aria-expanded={picker} onClick={() => setPicker((v) => !v)}><SmilePlus size={16} /></Button>
              {picker && (
                <div className="mc-picker" role="menu" aria-label="Choose a reaction">
                  {QUICK_EMOJIS.map((e) => <button key={e} type="button" role="menuitem" aria-label={`React with ${e}`} onClick={() => { setPicker(false); onReact(m, e) }}>{e}</button>)}
                </div>
              )}
            </span>
          )}
          {canPost && onReply && <Button variant="icon" size="sm" aria-label="Reply" onClick={() => onReply(m)}><CornerUpLeft size={16} /></Button>}
          {canPost && onThread && !m.thread && !m.threadId && <Button variant="icon" size="sm" aria-label="Start thread" onClick={() => onThread(m)}><MessageSquareText size={16} /></Button>}
          {moderator && onPin && !m.threadId && (
            <Button variant="icon" size="sm" aria-label={m.pinned ? 'Unpin message' : 'Pin message'} aria-pressed={!!m.pinned} onClick={() => onPin(m)}
              style={m.pinned ? { color: 'var(--mc-brand-text)' } : undefined} title={m.pinned ? 'Unpin message' : 'Pin message'}>
              {m.pinned ? <PinOff size={15} /> : <Pin size={15} />}
            </Button>
          )}
          {mine && canPost && (!m.kind || m.kind === 'TEXT') && <Button variant="icon" size="sm" aria-label="Edit" onClick={() => onEdit(m)}><Pencil size={15} /></Button>}
          {m.editedAt && (mine || moderator) && <Button variant="icon" size="sm" aria-label="Edit history" onClick={() => onHistory(m)}><History size={16} /></Button>}
          {(!mine && onReport) || destructive ? <span className="mc-tools-sep" aria-hidden="true" /> : null}
          {!mine && onReport && <Button variant="icon" size="sm" aria-label="Report message" onClick={() => onReport(m)}><Flag size={15} /></Button>}
          {destructive && <Button variant="icon" size="sm" aria-label="Delete" onClick={() => onDelete(m)} style={{ color: 'var(--mc-danger)' }}><Trash2 size={15} /></Button>}
        </div>
      )}
    </article>
  )
}
