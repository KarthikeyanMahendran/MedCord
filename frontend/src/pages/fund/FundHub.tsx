import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeartHandshake, Plus } from 'lucide-react'
import { Alert, Button, EmptyState, PageHeader, Tabs } from '../../components/ui'
import { FundCardView } from '../../components/fund/FundCardView'
import { fundSummary, listFunds } from '../../api/fundraisers'
import type { FundCard, FundScope, FundSummary } from '../../api/fundraisers'
import { problemMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { inr } from '../../lib/fund'

export default function FundHub() {
  const { user } = useAuth()
  const [scope, setScope] = useState<FundScope>('live')
  const [cards, setCards] = useState<FundCard[] | null>(null)
  const [summary, setSummary] = useState<FundSummary | null>(null)
  const [pending, setPending] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  const canStart = user?.platformRole === 'ADMIN' || user?.accountType === 'DOCTOR' || user?.accountType === 'HEALTH_WORKER' || user?.verificationStatus === 'APPROVED'

  useEffect(() => { fundSummary().then(setSummary).catch(() => undefined); listFunds('pending').then((p) => setPending(p.length)).catch(() => undefined) }, [])
  useEffect(() => {
    let live = true
    setCards(null)
    listFunds(scope).then((c) => { if (live) { setCards(c); setErr(null) } }).catch((e) => { if (live) setErr(problemMessage(e)) })
    return () => { live = false }
  }, [scope])

  return (
    <div className="mc-page mc-page-wide">
      <PageHeader eyebrow="Care Fund" title="Help a neighbour get care"
        description="Doctors and health workers raise money for medicines and surgeries. Anyone in the community can give a little."
        actions={canStart ? <Link to="/fund/new" style={{ textDecoration: 'none' }}><Button><Plus size={16} /> Start a fundraiser</Button></Link> : undefined} />

      {summary && (
        <div className="fd-stats">
          <div><strong>{inr(summary.totalRaised)}</strong><span>raised so far</span></div>
          <div><strong>{summary.active}</strong><span>raising now</span></div>
          <div><strong>{summary.supporters}</strong><span>kind supporters</span></div>
          <div><strong>{summary.fundedCount}</strong><span>fully funded</span></div>
        </div>
      )}

      <Tabs<FundScope> label="Fundraisers" value={scope} onChange={setScope}
        items={[{ value: 'live', label: 'Raising now' }, { value: 'funded', label: 'Funded' }, { value: 'mine', label: 'Started by me' },
          ...(pending > 0 ? [{ value: 'pending' as FundScope, label: 'Needs review', count: pending }] : [])]} />

      {err && <Alert tone="danger">{err}</Alert>}
      {cards === null && !err && <p className="mc-hint">Loading…</p>}
      {cards && cards.length === 0 && (
        scope === 'live' ? (
          <div className="fd-how">
            <EmptyState icon={<HeartHandshake size={22} />} title="No fundraiser is open right now">
              {canStart ? 'When a patient needs money for medicine or surgery, start a fundraiser in their community.' : 'When a doctor or health worker opens one in your community, it shows here.'}</EmptyState>
            <ol>
              <li><strong>Start</strong> A doctor or health worker tells the patient's story, with no private details.</li>
              <li><strong>Verify</strong> A verified doctor confirms it, so everyone can trust it.</li>
              <li><strong>Give</strong> Community members give ₹10, ₹100 or more. Every update is shared.</li>
            </ol>
          </div>
        ) : <EmptyState icon={<HeartHandshake size={22} />} title="Nothing here yet">Fundraisers will appear here.</EmptyState>
      )}
      {cards && cards.length > 0 && <div className="fd-grid">{cards.map((c) => <FundCardView key={c.id} c={c} />)}</div>}
    </div>
  )
}
