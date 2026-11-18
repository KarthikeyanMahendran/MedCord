import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Compass, MessageCircle, Pencil, Search } from 'lucide-react'
import { Alert, Avatar, Badge, Button, Card, CardBody, FormGroup, Input, Modal, Textarea, gradientFor } from '../components/ui'
import type { Tone } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { resubmitVerification, updateProfile } from '../api/auth'
import { listMine } from '../api/communities'
import type { Community } from '../api/communities'
import { fieldErrors, problemMessage } from '../api/client'

const verifyTone: Record<string, Tone> = { APPROVED: 'success', PENDING: 'warning', REJECTED: 'danger' }
const statusTone: Record<string, Tone> = { ACTIVE: 'success', PENDING: 'warning', SUSPENDED: 'danger' }

export default function Home() {
  const { user, setUser } = useAuth()
  const [mine, setMine] = useState<Community[]>([])
  const [editing, setEditing] = useState(false)
  const [resubmitting, setResubmitting] = useState(false)
  const [form, setForm] = useState({ displayName: '', specialty: '', bio: '' })
  const [lic, setLic] = useState({ number: '', country: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { listMine().then(setMine).catch(() => undefined) }, [])
  if (!user) return null

  function openEdit() {
    setForm({ displayName: user!.displayName, specialty: user!.specialty ?? '', bio: user!.bio ?? '' })
    setErrors({}); setError(null); setEditing(true)
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErrors({}); setError(null)
    try {
      setUser(await updateProfile(form))
      setEditing(false); setNotice('Profile updated.')
    } catch (err) {
      const fe = fieldErrors(err); setErrors(fe)
      if (!Object.keys(fe).length) setError(problemMessage(err))
    } finally { setBusy(false) }
  }

  async function resubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErrors({}); setError(null)
    try {
      setUser(await resubmitVerification(lic.number, lic.country))
      setResubmitting(false); setNotice('Licence resubmitted. An admin will review it shortly.')
    } catch (err) {
      const fe = fieldErrors(err); setErrors(fe)
      if (!Object.keys(fe).length) setError(problemMessage(err))
    } finally { setBusy(false) }
  }

  const first = user.displayName.replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').split(' ')[0]

  return (
    <main className="mc-page">
      {notice && <Alert tone="success">{notice}</Alert>}
      {user.verificationStatus === 'REJECTED' && (
        <Alert tone="danger">
          <strong>Your licence was not verified.</strong>{user.rejectionReason && <> Reason: {user.rejectionReason}</>}
          <div style={{ marginTop: 8 }}>
            <Button size="sm" variant="secondary" onClick={() => { setLic({ number: '', country: user.licenseCountry ?? '' }); setErrors({}); setError(null); setResubmitting(true) }}>Correct and resubmit</Button>
          </div>
        </Alert>
      )}
      {user.verificationStatus === 'PENDING' && <Alert tone="info">Your licence is awaiting review. You will get the verified badge once approved.</Alert>}

      <Card>
        <div className="mc-hero" style={{ background: gradientFor(user.displayName) }}>
          <div className="mc-hero-glow" aria-hidden="true" />
          <h1>Welcome back, {first} 👋</h1>
          <p>Here&apos;s what&apos;s happening in your communities.</p>
        </div>
        <CardBody style={{ position: 'relative' }}>
          <div className="mc-row" style={{ marginTop: -64, justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Avatar name={user.displayName} size="lg" className="mc-ring" />
            <Button variant="secondary" size="sm" onClick={openEdit}><Pencil size={14} /> Edit profile</Button>
          </div>
          <div style={{ marginTop: 12 }}>
            <h2 style={{ fontSize: 24 }}>{user.displayName}</h2>
            <div className="mc-row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
              <Badge tone={statusTone[user.status] ?? 'neutral'}>{user.status}</Badge>
              {user.platformRole === 'ADMIN' && <Badge tone="info">Platform admin</Badge>}
              {user.verificationStatus && <Badge tone={verifyTone[user.verificationStatus] ?? 'neutral'}>License {user.verificationStatus.toLowerCase()}</Badge>}
            </div>
          </div>
          <dl className="mc-dl" style={{ marginTop: 20 }}>
            <dt>Email</dt><dd>{user.email}</dd>
            <dt>Specialty</dt><dd>{user.specialty ?? '—'}</dd>
            <dt>License country</dt><dd>{user.licenseCountry ?? '—'}</dd>
            <dt>About</dt><dd>{user.bio ?? '—'}</dd>
          </dl>
        </CardBody>
      </Card>

      <div className="mc-tiles">
        <Link to="/communities" className="mc-tile"><Compass size={22} /><strong>Discover</strong><span>Find specialty communities</span></Link>
        <Link to="/messages" className="mc-tile"><MessageCircle size={22} /><strong>Messages</strong><span>Direct and group chats</span></Link>
        <Link to="/search" className="mc-tile"><Search size={22} /><strong>Search</strong><span>Find any conversation</span></Link>
      </div>

      {mine.length > 0 && (
        <section aria-label="Your communities" style={{ display: 'grid', gap: 10 }}>
          <h2 style={{ fontSize: 16 }}>Your communities</h2>
          <div className="mc-grid-2">
            {mine.map((c) => (
              <Link key={c.id} to={`/communities/${c.id}`} className="mc-tile mc-tile-row">
                <Avatar name={c.name} size="md" /><span><strong>{c.name}</strong><span>{c.memberCount} members{c.specialtyTag ? ` · ${c.specialtyTag}` : ''}</span></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Modal isOpen={editing} onClose={() => setEditing(false)} title="Edit profile" size="sm">
        <form onSubmit={saveProfile} style={{ display: 'grid', gap: 14 }}>
          {error && <Alert tone="danger">{error}</Alert>}
          <FormGroup id="displayName" label="Full name" error={errors.displayName}><Input id="displayName" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} invalid={!!errors.displayName} required /></FormGroup>
          <FormGroup id="specialty" label="Specialty" error={errors.specialty}><Input id="specialty" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} invalid={!!errors.specialty} /></FormGroup>
          <FormGroup id="bio" label="About" error={errors.bio} hint="Up to 2000 characters"><Textarea id="bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} invalid={!!errors.bio} /></FormGroup>
          <div className="mc-row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Save</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={resubmitting} onClose={() => setResubmitting(false)} title="Resubmit licence" size="sm">
        <form onSubmit={resubmit} style={{ display: 'grid', gap: 14 }}>
          {error && <Alert tone="danger">{error}</Alert>}
          <FormGroup id="licNumber" label="License number" error={errors.licenseNumber}><Input id="licNumber" value={lic.number} onChange={(e) => setLic({ ...lic, number: e.target.value })} invalid={!!errors.licenseNumber} required /></FormGroup>
          <FormGroup id="licCountry" label="Country (ISO)" error={errors.licenseCountry}><Input id="licCountry" value={lic.country} maxLength={2} onChange={(e) => setLic({ ...lic, country: e.target.value })} invalid={!!errors.licenseCountry} required /></FormGroup>
          <div className="mc-row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setResubmitting(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Resubmit</Button>
          </div>
        </form>
      </Modal>
    </main>
  )
}
