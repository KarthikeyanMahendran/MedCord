import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Globe, Lock, Plus, Search, Users } from 'lucide-react'
import { Alert, Badge, Button, Card, CardBody, EmptyState, FormGroup, Input, Modal, Textarea } from '../components/ui'
import { createCommunity, discover, joinCommunity, listMine } from '../api/communities'
import type { Community } from '../api/communities'
import { fieldErrors, problemMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'

function CommunityCard({ c, action }: { c: Community; action?: React.ReactNode }) {
  return (
    <Card>
      <CardBody>
        <div className="mc-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Link to={`/communities/${c.id}`} style={{ fontWeight: 700, fontSize: 16 }}>{c.name}</Link>
            <div className="mc-row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              {c.specialtyTag && <Badge tone="info">{c.specialtyTag}</Badge>}
              <Badge tone="neutral">{c.visibility === 'PRIVATE' ? <><Lock size={11} /> Private</> : <><Globe size={11} /> Public</>}</Badge>
              <span className="mc-muted-sub"><Users size={12} style={{ verticalAlign: -2 }} /> {c.memberCount}</span>
            </div>
          </div>
          {action}
        </div>
        {c.description && <p className="mc-hint" style={{ margin: '10px 0 0' }}>{c.description}</p>}
      </CardBody>
    </Card>
  )
}

export default function Communities() {
  const { user } = useAuth()
  const [mine, setMine] = useState<Community[]>([])
  const [found, setFound] = useState<Community[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', specialtyTag: '', visibility: 'PUBLIC' as 'PUBLIC' | 'PRIVATE' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const verified = user?.verificationStatus === 'APPROVED' && user.status === 'ACTIVE'

  const load = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([listMine(), discover(q)])
      setMine(m)
      setFound(d)
      setError(null)
    } catch (e) { setError(problemMessage(e)) } finally { setLoading(false) }
  }, [q])

  useEffect(() => { const t = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(t) }, [load, q])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErrors({}); setError(null)
    try {
      await createCommunity({ ...form, description: form.description || undefined, specialtyTag: form.specialtyTag || undefined })
      setCreating(false); setForm({ name: '', description: '', specialtyTag: '', visibility: 'PUBLIC' })
      await load()
    } catch (err) {
      const fe = fieldErrors(err); setErrors(fe)
      if (!Object.keys(fe).length) setError(problemMessage(err))
    } finally { setBusy(false) }
  }

  async function join(c: Community) {
    try { await joinCommunity(c.id); await load() } catch (e) { setError(problemMessage(e)) }
  }

  const mineIds = new Set(mine.map((c) => c.id))
  const discoverable = found.filter((c) => !mineIds.has(c.id))

  return (
    <main className="mc-page mc-page-wide">
      <div className="mc-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22 }}>Communities</h1>
          <p className="mc-hint" style={{ margin: '4px 0 0' }}>Specialty groups for discussion, cases and collaboration.</p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={!verified} title={verified ? undefined : 'Only verified professionals can create communities'}>
          <Plus size={16} /> New community
        </Button>
      </div>
      {!verified && <Alert tone="info">You can browse and join communities now. Creating one requires a verified licence.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <section aria-labelledby="mine-h" style={{ display: 'grid', gap: 12 }}>
        <h2 id="mine-h" style={{ fontSize: 16 }}>Your communities</h2>
        {loading ? <div className="mc-skeleton" style={{ height: 80 }} /> : mine.length === 0
          ? <Card><EmptyState title="You haven't joined any communities yet">Find one below or ask for an invite link.</EmptyState></Card>
          : <div className="mc-grid-2">{mine.map((c) => <CommunityCard key={c.id} c={c} />)}</div>}
      </section>

      <section aria-labelledby="disc-h" style={{ display: 'grid', gap: 12 }}>
        <div className="mc-row" style={{ justifyContent: 'space-between' }}>
          <h2 id="disc-h" style={{ fontSize: 16 }}>Discover</h2>
          <div style={{ position: 'relative', width: 260 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 13, color: 'var(--mc-text-muted)' }} />
            <Input aria-label="Search communities" placeholder="Search by name or specialty" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 30 }} />
          </div>
        </div>
        {discoverable.length === 0 && !loading
          ? <Card><EmptyState title="No public communities to show">Try a different search.</EmptyState></Card>
          : <div className="mc-grid-2">{discoverable.map((c) => <CommunityCard key={c.id} c={c} action={<Button size="sm" variant="secondary" onClick={() => join(c)}>Join</Button>} />)}</div>}
      </section>

      <Modal isOpen={creating} onClose={() => setCreating(false)} title="Create community" size="sm">
        <form onSubmit={onCreate} style={{ display: 'grid', gap: 14 }}>
          <FormGroup id="cname" label="Name" error={errors.name}><Input id="cname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} invalid={!!errors.name} required /></FormGroup>
          <FormGroup id="ctag" label="Specialty tag" error={errors.specialtyTag}><Input id="ctag" value={form.specialtyTag} onChange={(e) => setForm({ ...form, specialtyTag: e.target.value })} placeholder="Cardiology" /></FormGroup>
          <FormGroup id="cdesc" label="Description" error={errors.description}><Textarea id="cdesc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormGroup>
          <FormGroup id="cvis" label="Visibility" hint="Private communities are invite-only and hidden from discovery">
            <select id="cvis" className="mc-input" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as 'PUBLIC' | 'PRIVATE' })}>
              <option value="PUBLIC">Public</option><option value="PRIVATE">Private</option>
            </select>
          </FormGroup>
          <div className="mc-row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create</Button>
          </div>
        </form>
      </Modal>
    </main>
  )
}
