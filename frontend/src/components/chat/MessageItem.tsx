import { useState } from 'react'
import { CornerUpLeft, Flag, History, MessageSquare, Pencil, Pin, PinOff, SmilePlus, Trash2 } from 'lucide-react'
import { Badge, Button } from '../ui'
import type { Message } from '../../api/messages'

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

export interface MessageItemProps {
  m: Message
  userId?: string
  canPost: boolean
  moderator: boolean
  onReply?: (m: Message) => void
  onEdit: (m: Message) => void
  onDelete: (m: Message) => void
  onHistory: (m: Message) => void
  onThread?: (m: Message) => void
  onReact?: (m: Message, emoji: string) => void
  onPin?: (m: Message) => void
  onReport?: (m: Message) => void
}

export const QUICK_EMOJIS = ['👍', '❤️', '🎉', '🙏', '👀', '✅', '🩺', '😂']

/** One message row with hover actions. Shared by the channel timeline and the thread panel. */
export function MessageItem({ m, userId, canPost, moderator, onReply, onEdit, onDelete, onHistory, onThread, onReact, onPin, onReport }: MessageItemProps) {
  const [picker, setPicker] = useState(false)
  const mine = m.author.id === userId
  return (
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
          {m.pinned && <Badge tone="warning"><Pin size={11} /> pinned</Badge>}
        </div>
        {m.deleted
          ? <div className="mc-msg-body mc-msg-deleted">This message was deleted.</div>
          : <div className="mc-msg-body">{m.body}{m.editedAt && <span className="mc-edited" title={new Date(m.editedAt).toLocaleString()}>(edited)</span>}</div>}
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
            <MessageSquare size={13} />
            <strong>{m.thread.replyCount} {m.thread.replyCount === 1 ? 'reply' : 'replies'}</strong>
            {m.thread.lastReplyAt && <span>last reply {time(m.thread.lastReplyAt)}</span>}
            {m.thread.archived && <Badge tone="neutral">archived</Badge>}
          </button>
        )}
      </div>
      {!m.deleted && (
        <div className="mc-msg-tools" role="toolbar" aria-label="Message actions">
          {canPost && onReact && (
            <span style={{ position: 'relative' }}>
              <Button variant="icon" size="sm" aria-label="Add reaction" aria-expanded={picker} onClick={() => setPicker((v) => !v)}><SmilePlus size={15} /></Button>
              {picker && (
                <div className="mc-picker" role="menu" aria-label="Choose a reaction">
                  {QUICK_EMOJIS.map((e) => <button key={e} type="button" role="menuitem" aria-label={`React with ${e}`} onClick={() => { setPicker(false); onReact(m, e) }}>{e}</button>)}
                </div>
              )}
            </span>
          )}
          {canPost && onReply && <Button variant="icon" size="sm" aria-label="Reply" onClick={() => onReply(m)}><CornerUpLeft size={15} /></Button>}
          {canPost && onThread && !m.thread && !m.threadId && <Button variant="icon" size="sm" aria-label="Start thread" onClick={() => onThread(m)}><MessageSquare size={15} /></Button>}
          {mine && canPost && <Button variant="icon" size="sm" aria-label="Edit" onClick={() => onEdit(m)}><Pencil size={15} /></Button>}
          {!mine && onReport && <Button variant="icon" size="sm" aria-label="Report message" onClick={() => onReport(m)}><Flag size={15} /></Button>}
          {m.editedAt && (mine || moderator) && <Button variant="icon" size="sm" aria-label="Edit history" onClick={() => onHistory(m)}><History size={15} /></Button>}
          {moderator && onPin && !m.threadId && (
            <Button variant="icon" size="sm" aria-label={m.pinned ? 'Unpin message' : 'Pin message'} onClick={() => onPin(m)}>{m.pinned ? <PinOff size={15} /> : <Pin size={15} />}</Button>
          )}
          {(mine || moderator) && <Button variant="icon" size="sm" aria-label="Delete" onClick={() => onDelete(m)}><Trash2 size={15} /></Button>}
        </div>
      )}
    </article>
  )
}
