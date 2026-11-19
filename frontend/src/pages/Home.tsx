import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, MessageCircle, Pencil, Users } from 'lucide-react'
import { Alert, Avatar, Badge, Button, Card, EmptyState, FormGroup, Input, Modal, PageHeader, Textarea, VerifiedMark } from '../components/ui'
import type { Tone } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { TaskGrid } from '../components/home/TaskGrid'
import { resubmitVerification, updateProfile } from '../api/auth'
import { listMine } from '../api/communities'
import type { Community } from '../api/communities'
import { listDms } from '../api/dms'
import type { Conversation } from '../api/dms'
import { fieldErrors, problemMessage } from '../api/client'

const verifyTone: Record<string, Tone> = { APPROVED: 'success', PENDING: 'warning', REJECTED: 'danger' }
const verifyLabel: Record<string, string> = { APPROVED: 'Verified', PENDING: 'Pending review', REJECTED: 'Not verified' }

function greeting(d = new Date()) {
  const h = d.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.round(mins / 60)}h`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export default function Home() {
  const { user, setUser } = useAuth()
  const [mine, setMine] = useState<Community[] | null>(null)
  const [convs, setConvs] = useState<Conversation[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [resubmitting, setResubmitting] = useState(false)
  const [form, setForm] = useState({ displayName: '', specialty: '', bio: '' })
  const [lic, setLic] = useState({ number: '', country: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listMine().then(setMine).catch(() => setMine([]))
    listDms().then(setConvs).catch(() => setConvs([]))
  }, [])
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
      setResubmitting(false); setNotice('Licence resubmitted. An administrator will review it shortly.')
    } catch (err) {
      const fe = fieldErrors(err); setErrors(fe)
      if (!Object.keys(fe).length) setError(problemMessage(err))
    } finally { setBusy(false) }
  }

  const first = user.displayName.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').split(' ')[0]
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const verified = user.verificationStatus === 'APPROVED'
  const isWorker = user.accountType === 'HEALTH_WORKER'

  return (
    <main className="mc-page mc-page-wide">
      <PageHeader eyebrow={today} title={`${greeting()}, ${first}`} description="Pick what you want to do. Everything else is in the menu on the left." />

      {notice && <Alert tone="success">{notice}</Alert>}
      {!isWorker && user.verificationStatus === 'REJECTED' && (
        <Alert tone="danger">
          <div style={{ flex: 1 }}>
            <strong>Your licence could not be verified.</strong>{user.rejectionReason && <> Reason: {user.rejectionReason}</>}
          </div>
          <Button size="sm" variant="secondary" onClick={() => { setLic({ number: '', country: user.licenseCountry ?? '' }); setErrors({}); setError(null); setResubmitting(true) }}>Correct and resubmit</Button>
        </Alert>
      )}
      {!isWorker && user.verificationStatus === 'PENDING' && (
        <Alert tone="info">Your licence is under review. You can browse and join communities now; creating communities unlocks once you&apos;re verified.</Alert>
      )}

      <TaskGrid />

      <section className="mc-stats" aria-label="Summary">
        <div className="mc-stat"><span>Communities</span><strong>{mine ? mine.length : '–'}</strong></div>
        <div className="mc-stat"><span>Conversations</span><strong>{convs ? convs.length : '–'}</strong></div>
        <div className="mc-stat"><span>{isWorker ? 'Role' : 'Licence status'}</span><strong style={{ fontSize: 15, paddingTop: 6 }}>
          {isWorker ? <Badge tone="info">Health worker</Badge> : user.verificationStatus ? <Badge tone={verifyTone[user.verificationStatus]}>{verifyLabel[user.verificationStatus]}</Badge> : '–'}
        </strong></div>
      </section>

      <div className="mc-layout-2">
        <div style={{ display: 'grid', gap: 16 }}>
          <Card>
            <div className="mc-card-head"><h2>Your communities</h2><Link to="/communities" className="mc-muted-sub">View all</Link></div>
            {mine === null ? <div style={{ padding: 20 }}><span className="mc-skeleton" style={{ width: '60%' }} /></div>
              : mine.length === 0 ? <EmptyState title="No communities yet" icon={<Users size={18} />} action={<Link to="/communities"><Button size="sm">Find a community</Button></Link>}>Join a specialty community to start discussing cases with peers.</EmptyState>
              : (
                <div className="mc-list">
                  {mine.map((c) => (
                    <Link key={c.id} to={`/communities/${c.id}`} className="mc-list-row">
                      <Avatar name={c.name} size="md" square />
                      <span className="mc-list-main"><strong style={{ fontWeight: 500 }}>{c.name}</strong><span>{c.memberCount} members{c.specialtyTag ? ` · ${c.specialtyTag}` : ''}{c.visibility === 'PRIVATE' ? ' · Private' : ''}</span></span>
                      <ChevronRight size={16} />
                    </Link>
                  ))}
                </div>
              )}
          </Card>

          <Card>
            <div className="mc-card-head"><h2>Recent conversations</h2><Link to="/messages" className="mc-muted-sub">Open messages</Link></div>
            {convs === null ? <div style={{ padding: 20 }}><span className="mc-skeleton" style={{ width: '50%' }} /></div>
              : convs.length === 0 ? <EmptyState title="No conversations yet" icon={<MessageCircle size={18} />}>Message a colleague from any community&apos;s member list.</EmptyState>
              : (
                <div className="mc-list">
                  {convs.slice(0, 4).map((c) => (
                    <Link key={c.id} to={`/messages/${c.id}`} className="mc-list-row">
                      <Avatar name={c.name} size="md" />
                      <span className="mc-list-main"><strong style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</strong>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessage ? `${c.lastMessage.authorName}: ${c.lastMessage.excerpt}` : 'No messages yet'}</span></span>
                      {c.lastMessage && <span className="mc-list-meta mc-num">{ago(c.lastMessage.at)}</span>}
                    </Link>
                  ))}
                </div>
              )}
          </Card>
        </div>

        <Card>
          <div className="mc-card-head"><h2>Profile</h2><Button variant="ghost" size="sm" onClick={openEdit}><Pencil size={13} /> Edit</Button></div>
          <div style={{ padding: 20, display: 'grid', gap: 18 }}>
            <div className="mc-row" style={{ gap: 14 }}>
              <Avatar name={user.displayName} size="lg" />
              <div style={{ minWidth: 0 }}>
                <div className="mc-row" style={{ gap: 6 }}><h3 style={{ fontSize: 16 }}>{user.displayName}</h3>{verified && <VerifiedMark size={16} />}</div>
                <div className="mc-muted-sub" style={{ fontSize: 13, marginTop: 2 }}>{user.specialty ?? 'No specialty set'}</div>
                {user.platformRole === 'ADMIN' && <div style={{ marginTop: 6 }}><Badge tone="info">Platform administrator</Badge></div>}
              </div>
            </div>
            <dl className="mc-dl" style={{ gridTemplateColumns: '96px 1fr' }}>
              <dt>Email</dt><dd style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</dd>
              <dt>Country</dt><dd>{user.licenseCountry ?? '—'}</dd>
              <dt>About</dt><dd style={{ color: user.bio ? undefined : 'var(--mc-text-faint)' }}>{user.bio ?? 'Add a short bio so colleagues know your focus.'}</dd>
            </dl>
          </div>
        </Card>
      </div>

      <Modal isOpen={editing} onClose={() => setEditing(false)} title="Edit profile" size="sm">
        <form onSubmit={saveProfile} style={{ display: 'grid', gap: 14 }}>
          {error && <Alert tone="danger">{error}</Alert>}
          <FormGroup id="displayName" label="Full name" error={errors.displayName}><Input id="displayName" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} invalid={!!errors.displayName} required /></FormGroup>
          <FormGroup id="specialty" label="Specialty" error={errors.specialty}><Input id="specialty" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} invalid={!!errors.specialty} /></FormGroup>
          <FormGroup id="bio" label="About" error={errors.bio} hint="Up to 2000 characters"><Textarea id="bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} invalid={!!errors.bio} /></FormGroup>
          <div className="mc-row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Save changes</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={resubmitting} onClose={() => setResubmitting(false)} title="Resubmit licence" size="sm">
        <form onSubmit={resubmit} style={{ display: 'grid', gap: 14 }}>
          {error && <Alert tone="danger">{error}</Alert>}
          <FormGroup id="licNumber" label="License number" error={errors.licenseNumber}><Input id="licNumber" value={lic.number} onChange={(e) => setLic({ ...lic, number: e.target.value })} invalid={!!errors.licenseNumber} required /></FormGroup>
          <FormGroup id="licCountry" label="Country (ISO)" error={errors.licenseCountry}><Input id="licCountry" value={lic.country} maxLength={2} onChange={(e) => setLic({ ...lic, country: e.target.value })} invalid={!!errors.licenseCountry} required /></FormGroup>
          <div className="mc-row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" onClick={() => setResubmitting(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Resubmit</Button>
          </div>
        </form>
      </Modal>
    </main>
  )
}
