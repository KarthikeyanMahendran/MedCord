import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Globe, Lock, Plus, Search, Users } from 'lucide-react'
import { Alert, Avatar, Badge, Button, Card, CardBody, EmptyState, FormGroup, Input, Modal, PageHeader, Textarea } from '../components/ui'
import { createCommunity, discover, joinCommunity, listMine } from '../api/communities'
import type { Community } from '../api/communities'
import { fieldErrors, problemMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'

function CommunityCard({ c, action }: { c: Community; action?: React.ReactNode }) {
  return (
    <Card>
      <CardBody style={{ display: 'grid', gap: 12, height: '100%' }}>
        <div className="mc-row" style={{ alignItems: 'flex-start' }}>
          <Avatar name={c.name} size="md" square />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link to={`/communities/${c.id}`} style={{ color: 'var(--mc-text)', fontWeight: 500, fontSize: 15 }}>{c.name}</Link>
            <div className="mc-muted-sub" style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              {c.visibility === 'PRIVATE' ? <Lock size={11} /> : <Globe size={11} />}{c.visibility === 'PRIVATE' ? 'Private' : 'Public'}
              <span aria-hidden="true">·</span><Users size={11} /> <span className="mc-num">{c.memberCount}</span> members
            </div>
          </div>
          {action}
        </div>
        {c.description && <p style={{ fontSize: 13, color: 'var(--mc-text-2)', lineHeight: 1.5 }}>{c.description}</p>}
        {c.specialtyTag && <div><Badge tone="neutral">{c.specialtyTag}</Badge></div>}
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
      <PageHeader title="Communities" description="Specialty groups for discussion, cases and collaboration."
        actions={<Button onClick={() => setCreating(true)} disabled={!verified} title={verified ? undefined : 'Only verified professionals can create communities'}><Plus size={15} /> New community</Button>} />
      {!verified && <Alert tone="info">You can browse and join communities now. Creating one requires a verified licence.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <section aria-labelledby="mine-h" style={{ display: 'grid', gap: 12 }}>
        <h2 id="mine-h" className="mc-section-title">Your communities</h2>
        {loading ? <div className="mc-skeleton" style={{ height: 80 }} /> : mine.length === 0
          ? <Card><EmptyState title="You haven't joined any communities yet" icon={<Users size={18} />}>Find one below, or ask a colleague for an invite link.</EmptyState></Card>
          : <div className="mc-grid-2">{mine.map((c) => <CommunityCard key={c.id} c={c} />)}</div>}
      </section>

      <section aria-labelledby="disc-h" style={{ display: 'grid', gap: 12 }}>
        <div className="mc-row" style={{ justifyContent: 'space-between' }}>
          <h2 id="disc-h" className="mc-section-title">Discover</h2>
          <div style={{ position: 'relative', width: 260 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--mc-text-faint)' }} />
            <Input aria-label="Search communities" placeholder="Search by name or specialty" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 30 }} />
          </div>
        </div>
        {discoverable.length === 0 && !loading
          ? <Card><EmptyState title="No public communities to show" icon={<Search size={18} />}>Try a different name or specialty.</EmptyState></Card>
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
