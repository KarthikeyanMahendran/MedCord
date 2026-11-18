import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { BookOpenCheck, Search, ThumbsUp } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Input, PageHeader } from '../../components/ui'
import { markHelpful, searchLibrary } from '../../api/cases'
import type { LibraryHit } from '../../api/cases'

export default function Library() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<LibraryHit[] | null>(null)
  const [voted, setVoted] = useState<Set<string>>(new Set())

  const run = (query: string) => searchLibrary(query).then(setHits).catch(() => setHits([]))
  useEffect(() => { void run('') }, [])

  async function helpful(h: LibraryHit) {
    if (voted.has(h.id)) return
    setVoted(new Set(voted).add(h.id))
    setHits((cur) => cur && cur.map((x) => (x.id === h.id ? { ...x, helpfulCount: x.helpfulCount + 1 } : x)))
    try { await markHelpful(h.id) } catch { /* the count refreshes on next search */ }
  }

  return (
    <main className="mc-page">
      <PageHeader eyebrow="Verified Answer Library" title="Ask the library first" description="Answers doctors verified on real cases, with patient details removed. Check here before sending a new case." />
      <form className="mc-row" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(q) }} style={{ gap: 8 }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, e.g. chest pain, fever child, rash…" aria-label="Search the library" />
        <Button type="submit"><Search size={15} /> Search</Button>
      </form>
      {hits === null ? <span className="mc-skeleton" style={{ width: '50%' }} />
        : hits.length === 0 ? <EmptyState title="No answers found" icon={<BookOpenCheck size={18} />}>Answered cases are added here automatically. Try other words, or send a new case.</EmptyState>
        : (
          <div style={{ display: 'grid', gap: 12 }}>
            {hits.map((h) => (
              <Card key={h.id}>
                <div className="mc-card-body" style={{ display: 'grid', gap: 10 }}>
                  <div className="mc-row" style={{ justifyContent: 'space-between' }}><Badge tone="info">{h.specialty}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => helpful(h)} disabled={voted.has(h.id)}><ThumbsUp size={13} /> Helpful · {h.helpfulCount}</Button></div>
                  <strong style={{ fontWeight: 500 }}>{h.questionSummary}</strong>
                  <p style={{ color: 'var(--mc-text-2)', lineHeight: 1.55 }}>{h.answer}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
    </main>
  )
}
