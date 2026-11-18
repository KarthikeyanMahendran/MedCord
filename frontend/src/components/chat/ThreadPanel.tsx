import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Archive, Send, X } from 'lucide-react'
import { Alert, Badge, Button, Modal } from '../ui'
import { MessageItem } from './MessageItem'
import { deleteMessage, editMessage, getThread, listThreadMessages, messageHistory, replyInThread, updateThread } from '../../api/messages'
import type { Message, Revision, Thread } from '../../api/messages'
import { problemMessage } from '../../api/client'

const POLL_MS = 4000

interface Props {
  threadId: string
  userId?: string
  canPost: boolean
  moderator: boolean
  onClose: () => void
  /** Called after a change so the main timeline can refresh its reply-count chip. */
  onChanged: () => void
}

export function ThreadPanel({ threadId, userId, canPost, moderator, onClose, onChanged }: Props) {
  const [thread, setThread] = useState<Thread | null>(null)
  const [replies, setReplies] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<Message | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null)
  const [history, setHistory] = useState<{ msg: Message; revs: Revision[] } | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  const merge = useCallback((incoming: Message[]) => setReplies((prev) => {
    const map = new Map(prev.map((m) => [m.id, m]))
    incoming.forEach((m) => map.set(m.id, m))
    return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  }), [])

  const refresh = useCallback(async () => {
    const [t, p] = await Promise.all([getThread(threadId), listThreadMessages(threadId)])
    setThread(t); merge(p.items)
  }, [threadId, merge])

  useEffect(() => {
    setReplies([]); setThread(null); setText(''); setEditing(null); setError(null)
    let alive = true
    refresh().catch((e) => alive && setError(problemMessage(e)))
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') refresh().catch(() => undefined) }, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [threadId, refresh])

  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'end' }) }, [replies.length])

  const open = !!thread && !thread.archived
  const canReply = canPost && open

  async function submit() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true); setError(null)
    try {
      if (editing) { merge([await editMessage(editing.id, body)]); setEditing(null) }
      else { merge([await replyInThread(threadId, body)]); await refresh(); onChanged() }
      setText('')
    } catch (e) { setError(problemMessage(e)) } finally { setSending(false) }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() }
    else if (e.key === 'Escape') { setEditing(null); setText('') }
  }

  async function doDelete() {
    if (!confirmDelete) return
    try { await deleteMessage(confirmDelete.id); merge([{ ...confirmDelete, deleted: true, body: null }]); setConfirmDelete(null); await refresh(); onChanged() }
    catch (e) { setError(problemMessage(e)); setConfirmDelete(null) }
  }

  async function toggleArchive() {
    if (!thread) return
    try { setThread(await updateThread(threadId, { archived: !thread.archived })); onChanged() } catch (e) { setError(problemMessage(e)) }
  }

  const canManage = !!thread && (thread.createdBy === userId || moderator)
  const common = { userId, canPost: canReply, moderator, onEdit: (m: Message) => { setEditing(m); setText(m.body ?? '') }, onDelete: setConfirmDelete,
    onHistory: async (m: Message) => { try { setHistory({ msg: m, revs: await messageHistory(m.id) }) } catch (e) { setError(problemMessage(e)) } } }

  return (
    <aside className="mc-thread" aria-label="Thread">
      <div className="mc-thread-head">
        <div style={{ minWidth: 0 }}>
          <strong>{thread?.title ?? 'Thread'}</strong>
          <div className="mc-muted-sub">{thread ? `${thread.replyCount} ${thread.replyCount === 1 ? 'reply' : 'replies'}` : '…'} {thread?.archived && <Badge tone="neutral">archived</Badge>}</div>
        </div>
        <div className="mc-row">
          {canManage && <Button variant="ghost" size="sm" onClick={toggleArchive}><Archive size={14} /> {thread?.archived ? 'Reopen' : 'Archive'}</Button>}
          <Button variant="icon" aria-label="Close thread" onClick={onClose}><X size={16} /></Button>
        </div>
      </div>

      <div className="mc-thread-body">
        {thread && <div className="mc-thread-root"><MessageItem {...common} m={thread.root} canPost={false} onEdit={() => undefined} onDelete={() => undefined} onHistory={() => undefined} /></div>}
        {replies.map((m) => <MessageItem key={m.id} {...common} m={m} />)}
        <div ref={bottom} />
      </div>

      <div className="mc-composer">
        {error && <Alert tone="danger">{error}</Alert>}
        {editing && <div className="mc-composer-bar"><span>Editing reply · Esc to cancel</span><Button variant="icon" size="sm" aria-label="Cancel edit" onClick={() => { setEditing(null); setText('') }}><X size={14} /></Button></div>}
        {thread && !canReply
          ? <Alert tone="info">{thread.archived ? 'This thread is archived.' : 'You do not have permission to reply.'}</Alert>
          : (
            <div className="mc-composer-row">
              <textarea className="mc-input" rows={1} aria-label="Reply in thread" placeholder="Reply in thread" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} maxLength={4000} />
              <Button onClick={submit} loading={sending} disabled={!text.trim()} aria-label={editing ? 'Save edit' : 'Send reply'}><Send size={16} /></Button>
            </div>
          )}
      </div>

      <Modal isOpen={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete reply?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={doDelete}>Delete</Button></>}>
        The reply will be removed for everyone. A copy is kept for moderation audit.
      </Modal>
      <Modal isOpen={history !== null} onClose={() => setHistory(null)} title="Edit history" size="md">
        <div style={{ display: 'grid', gap: 10 }}>
          {history?.revs.map((r) => (
            <div key={r.revisionNo} className="mc-rev"><div className="mc-muted-sub">Version {r.revisionNo} · by {r.actorName} · {new Date(r.createdAt).toLocaleString()}</div><div className="mc-msg-body" style={{ marginTop: 4 }}>{r.body}</div></div>
          ))}
          {history && <div className="mc-rev" style={{ borderColor: 'var(--mc-brand)' }}><div className="mc-muted-sub">Current version</div><div className="mc-msg-body" style={{ marginTop: 4 }}>{history.msg.body}</div></div>}
        </div>
      </Modal>
    </aside>
  )
}
