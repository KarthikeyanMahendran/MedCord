import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { Alert, Button, Card, FormGroup, Input, Textarea } from '../../components/ui'
import { listMine } from '../../api/communities'
import type { Community } from '../../api/communities'
import { createFund } from '../../api/fundraisers'
import type { FundNeed } from '../../api/fundraisers'
import { fieldErrors, problemMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { NEED_ICON, NEED_LABEL, inr } from '../../lib/fund'

const NEEDS: FundNeed[] = ['MEDICINE', 'SURGERY', 'TESTS', 'TRANSPORT', 'OTHER']
const GOALS = [2000, 5000, 10000, 25000, 50000]
const DAYS: { label: string; days: number | null }[] = [{ label: '1 week', days: 7 }, { label: '2 weeks', days: 14 }, { label: '1 month', days: 30 }, { label: 'No end date', days: null }]

const dateIn = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }

export default function NewFundraiser() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [communities, setCommunities] = useState<Community[] | null>(null)
  const [communityId, setCommunityId] = useState(params.get('communityId') ?? '')
  const [beneficiary, setBeneficiary] = useState('')
  const [need, setNeed] = useState<FundNeed>('SURGERY')
  const [goal, setGoal] = useState<number | ''>(10000)
  const [title, setTitle] = useState('')
  const [story, setStory] = useState('')
  const [days, setDays] = useState<number | null>(30)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const caseId = params.get('caseId') ?? undefined
  const isStaff = user?.platformRole === 'ADMIN' || user?.accountType === 'DOCTOR' || user?.verificationStatus === 'APPROVED'

  useEffect(() => {
    listMine().then((c) => { setCommunities(c); if (!communityId && c.length === 1) setCommunityId(c[0].id) }).catch((e) => setError(problemMessage(e)))
  }, [communityId])

  async function submit() {
    setBusy(true); setErrors({}); setError(null)
    try {
      const f = await createFund({ communityId, caseId, title, story, beneficiary, need, goalAmount: Number(goal), deadline: days ? dateIn(days) : undefined })
      navigate(`/fund/${f.id}`, { replace: true })
    } catch (e) {
      const fe = fieldErrors(e)
      if (Object.keys(fe).length) setErrors(fe); else setError(problemMessage(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="mc-page nf-page">
      <Link to="/fund" className="fd-back"><ArrowLeft size={14} /> Care Fund</Link>
      <h1 className="nf-title">Start a fundraiser</h1>
      <p className="mc-hint">{isStaff ? 'It goes live as soon as you post it.' : 'A verified doctor will confirm it first, so everyone can trust it.'}</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Alert tone="info"><ShieldAlert size={14} style={{ verticalAlign: '-2px' }} /> Protect the patient: use a first name and age only. No phone numbers, addresses or ID numbers.</Alert>

      <Card><div className="nf-form">
        <FormGroup id="communityId" label="1. Which community is this for?" error={errors.communityId}
          hint={communities && communities.length === 0 ? 'Join or create a community first.' : 'Members of this community will be asked to help.'}>
          <select id="communityId" className="mc-select mc-select-block" value={communityId} onChange={(e) => setCommunityId(e.target.value)} aria-invalid={!!errors.communityId || undefined}>
            <option value="">Choose a community</option>
            {(communities ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormGroup>

        <FormGroup id="beneficiary" label="2. Who is it for?" error={errors.beneficiary} hint="First name and age, for example “Ravi, 54”.">
          <Input id="beneficiary" value={beneficiary} maxLength={80} onChange={(e) => setBeneficiary(e.target.value)} placeholder="Ravi, 54" invalid={!!errors.beneficiary} />
        </FormGroup>

        <div>
          <div className="nf-label">3. What is the money for?</div>
          <div className="fd-chips" role="radiogroup" aria-label="What the money is for">
            {NEEDS.map((n) => <button key={n} type="button" role="radio" aria-checked={need === n} className={need === n ? 'is-on' : ''} onClick={() => setNeed(n)}>{NEED_ICON[n]} {NEED_LABEL[n]}</button>)}
          </div>
          {errors.need && <p className="mc-error">{errors.need}</p>}
        </div>

        <div>
          <div className="nf-label">4. How much is needed?</div>
          <div className="fd-chips" role="group" aria-label="Goal amount">
            {GOALS.map((g) => <button key={g} type="button" className={goal === g ? 'is-on' : ''} onClick={() => setGoal(g)}>{inr(g)}</button>)}
          </div>
          <FormGroup id="goal" label="" error={errors.goalAmount} hint="You can type another amount. Use the real cost from the hospital estimate.">
            <Input id="goal" type="number" inputMode="numeric" min={100} value={goal} onChange={(e) => setGoal(e.target.value === '' ? '' : Number(e.target.value))} invalid={!!errors.goalAmount} aria-label="Goal amount in rupees" />
          </FormGroup>
        </div>

        <FormGroup id="title" label="5. A short title" error={errors.title}>
          <Input id="title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Heart surgery for Ravi" invalid={!!errors.title} />
        </FormGroup>

        <FormGroup id="story" label="6. Tell the story" error={errors.story} hint={`${story.length}/2000. What happened, what treatment is needed, and why the family cannot pay.`}>
          <Textarea id="story" rows={6} value={story} maxLength={2000} onChange={(e) => setStory(e.target.value)} invalid={!!errors.story} />
        </FormGroup>

        <div>
          <div className="nf-label">7. How long should it run?</div>
          <div className="fd-chips" role="radiogroup" aria-label="Duration">
            {DAYS.map((d) => <button key={d.label} type="button" role="radio" aria-checked={days === d.days} className={days === d.days ? 'is-on' : ''} onClick={() => setDays(d.days)}>{d.label}</button>)}
          </div>
          {errors.deadline && <p className="mc-error">{errors.deadline}</p>}
        </div>

        {caseId && <p className="mc-hint">This fundraiser will be linked to your case room.</p>}
        <Button full loading={busy} disabled={!communityId} onClick={submit}>{isStaff ? 'Post fundraiser' : 'Send for doctor review'}</Button>
      </div></Card>
    </div>
  )
}
