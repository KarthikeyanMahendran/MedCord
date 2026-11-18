import { useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { Alert, Badge, Button, Card, CardBody, FormGroup, Input, Modal, Textarea } from '../components/ui'
import type { Tone } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { resubmitVerification, updateProfile } from '../api/auth'
import { fieldErrors, problemMessage } from '../api/client'

const verifyTone: Record<string, Tone> = { APPROVED: 'success', PENDING: 'warning', REJECTED: 'danger' }
const statusTone: Record<string, Tone> = { ACTIVE: 'success', PENDING: 'warning', SUSPENDED: 'danger' }

export default function Home() {
  const { user, setUser } = useAuth()
  const [editing, setEditing] = useState(false)
  const [resubmitting, setResubmitting] = useState(false)
  const [form, setForm] = useState({ displayName: '', specialty: '', bio: '' })
  const [lic, setLic] = useState({ number: '', country: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!user) return null
  const initials = user.displayName.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

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
        <CardBody>
          <div className="mc-row" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
            <div className="mc-row">
              <div className="mc-avatar" aria-hidden="true">{initials}</div>
              <div>
                <h1 style={{ fontSize: 22 }}>{user.displayName}</h1>
                <div className="mc-row" style={{ marginTop: 6 }}>
                  <Badge tone={statusTone[user.status] ?? 'neutral'}>{user.status}</Badge>
                  {user.platformRole === 'ADMIN' && <Badge tone="info">Platform admin</Badge>}
                  {user.verificationStatus && <Badge tone={verifyTone[user.verificationStatus] ?? 'neutral'}>License {user.verificationStatus.toLowerCase()}</Badge>}
                </div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={openEdit}><Pencil size={14} /> Edit profile</Button>
          </div>
          <dl className="mc-dl">
            <dt>Email</dt><dd>{user.email}</dd>
            <dt>Specialty</dt><dd>{user.specialty ?? '—'}</dd>
            <dt>License country</dt><dd>{user.licenseCountry ?? '—'}</dd>
            <dt>About</dt><dd>{user.bio ?? '—'}</dd>
            <dt>Account ID</dt><dd style={{ fontFamily: 'monospace', fontSize: 12 }}>{user.id}</dd>
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <strong>Communities are coming next.</strong>
          <p className="mc-hint" style={{ margin: '6px 0 0' }}>Channels, threads and messaging arrive in the upcoming milestones.</p>
        </CardBody>
      </Card>

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
