import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HandHeart, MessageCircle, Plus } from 'lucide-react'
import { Alert, Badge, Button, Card, EmptyState, FormGroup, Input, Modal, PageHeader, Tabs } from '../../components/ui'
import { ago } from '../../components/cases/UrgencyBadge'
import { VoiceInput, VoiceTextarea } from '../../components/VoiceField'
import { cancelDispatch, claimDispatch, createDispatch, finishDispatch, listDispatch } from '../../api/support'
import type { Dispatch, DispatchKind } from '../../api/support'
import { startDm } from '../../api/dms'
import { fieldErrors, problemMessage } from '../../api/client'

const KINDS: { id: DispatchKind; label: string; icon: string }[] = [
  { id: 'TRANSPORT', label: 'A ride', icon: '🚗' }, { id: 'MEDICINE', label: 'Medicine pick-up', icon: '💊' }, { id: 'VISIT', label: 'A home visit', icon: '🏠' },
  { id: 'FOOD', label: 'Food or supplies', icon: '🍲' }, { id: 'OTHER', label: 'Something else', icon: '🤝' },
]
const kindOf = (k: DispatchKind) => KINDS.find((x) => x.id === k)!

type Scope = 'open' | 'mine'

export default function DispatchPage() {
  const navigate = useNavigate()
  const [scope, setScope] = useState<Scope>('open')
  const [items, setItems] = useState<Dispatch[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ kind: 'TRANSPORT' as DispatchKind, urgency: 'NORMAL' as 'NORMAL' | 'URGENT', title: '', details: '', area: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const load = useCallback(async () => { try { setItems(await listDispatch(scope)); setErr(null) } catch (e) { setErr(problemMessage(e)) } }, [scope])
  useEffect(() => { setItems(null); void load() }, [load])

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id); setErr(null)
    try { await fn(); await load() } catch (e) { setErr(problemMessage(e)) } finally { setBusy(null) }
  }

  async function openRoom(userId: string) {
    try { const c = await startDm([userId]); navigate(`/messages/${c.id}`) } catch (e) { setErr(problemMessage(e)) }
  }

  async function submit() {
    setBusy('new'); setErrors({})
    try {
      await createDispatch({ ...form, details: form.details || undefined, area: form.area || undefined })
      setOpen(false); setForm({ ...form, title: '', details: '', area: '' }); setScope('mine'); await load()
    } catch (e) { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else setErr(problemMessage(e)) } finally { setBusy(null) }
  }

  return (
    <div className="mc-page mc-page-wide">
      <PageHeader eyebrow="Volunteer help" title="Ask for help or lend a hand"
        description="Need a ride, medicine or a visit? Ask here. Volunteers nearby can say “I can help” and message you in a private room."
        actions={<Button onClick={() => setOpen(true)}><Plus size={16} /> I need help</Button>} />

      <Tabs<Scope> label="Requests" value={scope} onChange={setScope} items={[{ value: 'open', label: 'People who need help' }, { value: 'mine', label: 'My requests and offers' }]} />
      {err && <Alert tone="danger">{err}</Alert>}
      {items === null && !err && <p className="mc-hint">Loading…</p>}
      {items?.length === 0 && <EmptyState icon={<HandHeart size={22} />} title={scope === 'open' ? 'No one is waiting for help' : 'Nothing here yet'}>
        {scope === 'open' ? 'When someone asks for help, you will see it here. You can take one with a single tap.' : 'Requests you make, and requests you take, show here.'}</EmptyState>}

      <div className="dp-list">
        {items?.map((d) => (
          <Card key={d.id}><div className="dp-card">
            <div className="dp-head">
              <span className="fd-need"><span aria-hidden="true">{kindOf(d.kind).icon}</span> {kindOf(d.kind).label}</span>
              {d.urgency === 'URGENT' && <Badge tone="danger">Urgent</Badge>}
              <Badge tone={d.status === 'OPEN' ? 'info' : d.status === 'CLAIMED' ? 'warning' : d.status === 'DONE' ? 'success' : 'neutral'}>
                {d.status === 'OPEN' ? 'Waiting for a volunteer' : d.status === 'CLAIMED' ? 'A volunteer is helping' : d.status === 'DONE' ? 'Done' : 'Cancelled'}</Badge>
            </div>
            <h3>{d.title}</h3>
            {d.details && <p className="dp-details">{d.details}</p>}
            <p className="dp-meta">{d.requesterName}{d.area ? ` · ${d.area}` : ''} · {ago(d.createdAt)}{d.volunteerName ? ` · helper: ${d.volunteerName}` : ''}</p>
            <div className="dp-actions">
              {d.status === 'OPEN' && !d.mine && <Button loading={busy === d.id} onClick={() => act(d.id, async () => { await claimDispatch(d.id); await openRoom(d.requesterId) })}><HandHeart size={16} /> I can help</Button>}
              {d.status === 'CLAIMED' && d.mine && d.volunteerId && <Button variant="secondary" onClick={() => openRoom(d.volunteerId!)}><MessageCircle size={15} /> Message {d.volunteerName}</Button>}
              {d.status === 'CLAIMED' && d.mineAsVolunteer && <Button variant="secondary" onClick={() => openRoom(d.requesterId)}><MessageCircle size={15} /> Message {d.requesterName}</Button>}
              {d.status === 'CLAIMED' && (d.mine || d.mineAsVolunteer) && <Button loading={busy === d.id} onClick={() => act(d.id, () => finishDispatch(d.id))}>Mark as done</Button>}
              {(d.status === 'OPEN' || d.status === 'CLAIMED') && d.mine && <Button variant="ghost" loading={busy === d.id} onClick={() => act(d.id, () => cancelDispatch(d.id))}>Cancel request</Button>}
            </div>
          </div></Card>
        ))}
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="What do you need?"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy === 'new'} onClick={submit}>Send request</Button></>}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="fd-chips" role="radiogroup" aria-label="What you need">
            {KINDS.map((k) => <button key={k.id} type="button" role="radio" aria-checked={form.kind === k.id} className={form.kind === k.id ? 'is-on' : ''} onClick={() => setForm({ ...form, kind: k.id })}>{k.icon} {k.label}</button>)}
          </div>
          {errors.kind && <p className="mc-error">{errors.kind}</p>}
          <FormGroup id="dtitle" label="In a few words" error={errors.title}>
            <VoiceInput id="dtitle" value={form.title} maxLength={100} placeholder="Need a ride to the clinic tomorrow morning" onValue={(v) => setForm((f) => ({ ...f, title: v }))} invalid={!!errors.title} />
          </FormGroup>
          <FormGroup id="dnear" label="Where? (village or town)" error={errors.area}>
            <Input id="dnear" value={form.area} maxLength={120} placeholder="Meppadi, Wayanad" onChange={(e) => setForm({ ...form, area: e.target.value })} />
          </FormGroup>
          <FormGroup id="ddet" label="Anything else they should know? (optional)" error={errors.details} hint="Do not write phone numbers. Volunteers will message you here.">
            <VoiceTextarea id="ddet" rows={3} value={form.details} maxLength={600} onValue={(v) => setForm((f) => ({ ...f, details: v }))} />
          </FormGroup>
          <label className="fd-check"><input type="checkbox" checked={form.urgency === 'URGENT'} onChange={(e) => setForm({ ...form, urgency: e.target.checked ? 'URGENT' : 'NORMAL' })} /> This is urgent</label>
        </div>
      </Modal>
    </div>
  )
}
