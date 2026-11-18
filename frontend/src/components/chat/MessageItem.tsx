import { CornerUpLeft, History, MessageSquare, Pencil, Trash2 } from 'lucide-react'
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
}

/** One message row with hover actions. Shared by the channel timeline and the thread panel. */
export function MessageItem({ m, userId, canPost, moderator, onReply, onEdit, onDelete, onHistory, onThread }: MessageItemProps) {
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
        </div>
        {m.deleted
          ? <div className="mc-msg-body mc-msg-deleted">This message was deleted.</div>
          : <div className="mc-msg-body">{m.body}{m.editedAt && <span className="mc-edited" title={new Date(m.editedAt).toLocaleString()}>(edited)</span>}</div>}
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
          {canPost && onReply && <Button variant="icon" size="sm" aria-label="Reply" onClick={() => onReply(m)}><CornerUpLeft size={15} /></Button>}
          {canPost && onThread && !m.thread && !m.threadId && <Button variant="icon" size="sm" aria-label="Start thread" onClick={() => onThread(m)}><MessageSquare size={15} /></Button>}
          {mine && canPost && <Button variant="icon" size="sm" aria-label="Edit" onClick={() => onEdit(m)}><Pencil size={15} /></Button>}
          {m.editedAt && (mine || moderator) && <Button variant="icon" size="sm" aria-label="Edit history" onClick={() => onHistory(m)}><History size={15} /></Button>}
          {(mine || moderator) && <Button variant="icon" size="sm" aria-label="Delete" onClick={() => onDelete(m)}><Trash2 size={15} /></Button>}
        </div>
      )}
    </article>
  )
}
