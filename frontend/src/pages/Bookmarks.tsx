import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, ExternalLink, Hash, MessageCircle, Pencil, Trash2 } from 'lucide-react'
import { bookmarkMessage, listBookmarks, unbookmarkMessage } from '../api/messages'
import type { BookmarkItem } from '../api/messages'
import { problemMessage } from '../api/client'
import { MarkdownBody } from '../components/chat/MarkdownBody'
import { AttachmentList } from '../components/chat/AttachmentView'
import { Alert, Avatar, Badge, Button, Card, CardBody, EmptyState, Input, Modal, PageHeader, Textarea, VerifiedMark } from '../components/ui'

export default function Bookmarks() {
  const [items, setItems] = useState<BookmarkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [editingNote, setEditingNote] = useState<BookmarkItem | null>(null)
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await listBookmarks())
      setError(null)
    } catch (e) {
      setError(problemMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter((b) =>
      (b.message.body ?? '').toLowerCase().includes(q)
      || (b.note ?? '').toLowerCase().includes(q)
      || b.channelName.toLowerCase().includes(q)
      || (b.communityName ?? '').toLowerCase().includes(q)
      || b.message.author.displayName.toLowerCase().includes(q),
    )
  }, [items, filter])

  async function remove(messageId: string) {
    try {
      await unbookmarkMessage(messageId)
      setItems((prev) => prev.filter((b) => b.messageId !== messageId))
    } catch (e) {
      setError(problemMessage(e))
    }
  }

  async function saveNote() {
    if (!editingNote) return
    setSaving(true)
    try {
      await bookmarkMessage(editingNote.messageId, noteText)
      setItems((prev) => prev.map((b) => (b.messageId === editingNote.messageId ? { ...b, note: noteText.trim() || null } : b)))
      setEditingNote(null)
    } catch (e) {
      setError(problemMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mc-page mc-page-wide">
      <PageHeader
        eyebrow="Personal library"
        title="Saved messages"
        description="Clinical pearls, protocols, and references you bookmarked from channels and threads."
        actions={
          <Input
            aria-label="Filter saved messages"
            placeholder="Filter by keyword, note, or channel…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 260 }}
          />
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}
      {loading && <div className="mc-skeleton" style={{ height: 120 }} />}
      {!loading && filtered.length === 0 && (
        <EmptyState title={items.length === 0 ? 'No saved messages yet' : 'No matches'} icon={<Bookmark size={20} />}>
          {items.length === 0
            ? 'Hover any message in a channel or thread and click the bookmark icon to save it here.'
            : 'Try another search keyword.'}
        </EmptyState>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {filtered.map((b) => {
          const href = b.communityId ? `/communities/${b.communityId}/channels/${b.channelId}` : `/messages/${b.channelId}`
          return (
            <Card key={b.messageId}>
              <CardBody>
                <div className="mc-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <div className="mc-row" style={{ gap: 8 }}>
                    <Avatar name={b.message.author.displayName} size="sm" />
                    <strong>{b.message.author.displayName}</strong>
                    {b.message.author.verified && <VerifiedMark size={13} />}
                    <Badge tone="neutral">
                      {b.communityId ? <><Hash size={11} /> {b.channelName}</> : <><MessageCircle size={11} /> Direct message</>}
                    </Badge>
                    {b.communityName && <span className="mc-muted-sub">{b.communityName}</span>}
                  </div>
                  <div className="mc-row" style={{ gap: 4 }}>
                    <Button variant="ghost" size="sm" onClick={() => { setEditingNote(b); setNoteText(b.note ?? '') }}>
                      <Pencil size={13} /> {b.note ? 'Edit note' : 'Add note'}
                    </Button>
                    <Link to={href} className="mc-btn mc-btn-ghost mc-btn-sm">
                      <ExternalLink size={13} /> Open
                    </Link>
                    <Button variant="ghost" size="sm" aria-label="Remove bookmark" onClick={() => remove(b.messageId)} style={{ color: 'var(--mc-danger)' }}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>

                {b.note && (
                  <div className="mc-bookmark-note">
                    <strong>Note:</strong> {b.note}
                  </div>
                )}

                {b.message.body && <div className="mc-msg-body"><MarkdownBody text={b.message.body} /></div>}
                {b.message.attachments && b.message.attachments.length > 0 && <AttachmentList attachments={b.message.attachments} />}
              </CardBody>
            </Card>
          )
        })}
      </div>

      <Modal isOpen={editingNote !== null} onClose={() => setEditingNote(null)} title="Personal note" size="sm"
        footer={<><Button variant="secondary" onClick={() => setEditingNote(null)}>Cancel</Button><Button loading={saving} onClick={saveNote}>Save note</Button></>}>
        <Textarea rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} maxLength={500} placeholder="Add a clinical reminder or tag (only visible to you)…" />
      </Modal>
    </main>
  )
}
