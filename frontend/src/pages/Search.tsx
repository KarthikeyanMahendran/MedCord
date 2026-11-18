import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Hash, MessageCircle, Search as SearchIcon } from 'lucide-react'
import { Alert, Button, Card, CardBody, EmptyState, Input } from '../components/ui'
import { Highlight } from '../components/chat/Highlight'
import { listMine } from '../api/communities'
import type { Community } from '../api/communities'
import { search } from '../api/search'
import type { Hit } from '../api/search'
import { problemMessage } from '../api/client'

const when = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Search() {
  const [q, setQ] = useState('')
  const [communityId, setCommunityId] = useState('')
  const [communities, setCommunities] = useState<Community[]>([])
  const [hits, setHits] = useState<Hit[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { listMine().then(setCommunities).catch(() => undefined) }, [])

  // Debounced search; resets to the first page whenever the query or filter changes.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits([]); setSearched(false); setHasMore(false); setError(null); return }
    let alive = true
    const t = setTimeout(() => {
      setLoading(true)
      search(term, { communityId: communityId || undefined })
        .then((p) => { if (alive) { setHits(p.items); setHasMore(p.hasMore); setSearched(true); setError(null) } })
        .catch((e) => alive && setError(problemMessage(e)))
        .finally(() => alive && setLoading(false))
    }, 300)
    return () => { alive = false; clearTimeout(t) }
  }, [q, communityId])

  async function more() {
    setLoading(true)
    try {
      const p = await search(q.trim(), { communityId: communityId || undefined, offset: hits.length })
      setHits((h) => [...h, ...p.items]); setHasMore(p.hasMore)
    } catch (e) { setError(problemMessage(e)) } finally { setLoading(false) }
  }

  const link = (h: Hit) => (h.dm ? `/messages/${h.channelId}` : `/communities/${h.communityId}/channels/${h.channelId}`)

  return (
    <main className="mc-page mc-page-wide">
      <div>
        <h1 style={{ fontSize: 22 }}>Search</h1>
        <p className="mc-hint" style={{ margin: '4px 0 0' }}>Search messages in your communities and direct messages. Use "quotes" for phrases and -word to exclude.</p>
      </div>
      <div className="mc-row" style={{ gap: 12 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <SearchIcon size={15} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--mc-text-muted)' }} />
          <Input aria-label="Search messages" autoFocus placeholder="Search messages…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 34 }} />
        </div>
        <select className="mc-input" style={{ width: 220 }} aria-label="Filter by community" value={communityId} onChange={(e) => setCommunityId(e.target.value)}>
          <option value="">All communities</option>
          {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {q.trim().length < 2 && <Card><EmptyState title="Type at least 2 characters to search" /></Card>}
      {searched && hits.length === 0 && !loading && <Card><EmptyState title="No messages found">Try different words or remove the community filter.</EmptyState></Card>}
      <div style={{ display: 'grid', gap: 10 }}>
        {hits.map((h) => (
          <Card key={h.messageId}>
            <CardBody style={{ padding: 14 }}>
              <div className="mc-row" style={{ justifyContent: 'space-between' }}>
                <Link to={link(h)} className="mc-row" style={{ gap: 6, fontWeight: 600 }}>
                  {h.dm ? <MessageCircle size={14} /> : <Hash size={14} />}{h.dm ? 'Direct message' : `${h.channelName} · ${h.communityName}`}
                </Link>
                <span className="mc-muted-sub">{h.authorName} · {when(h.createdAt)}</span>
              </div>
              <p className="mc-msg-body" style={{ margin: '6px 0 0' }}><Highlight text={h.snippet} /></p>
            </CardBody>
          </Card>
        ))}
      </div>
      {hasMore && <div style={{ textAlign: 'center' }}><Button variant="secondary" onClick={more} loading={loading}>Load more</Button></div>}
    </main>
  )
}
