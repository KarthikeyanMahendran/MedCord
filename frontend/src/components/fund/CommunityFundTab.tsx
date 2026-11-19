import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeartHandshake, Plus } from 'lucide-react'
import { Alert, Button, EmptyState } from '../ui'
import { FundCardView } from './FundCardView'
import { listFunds } from '../../api/fundraisers'
import type { FundCard } from '../../api/fundraisers'
import { problemMessage } from '../../api/client'

/** The Care Fund tab inside a community: this community's fundraisers and a way to start one. */
export function CommunityFundTab({ communityId, canStart }: { communityId: string; canStart: boolean }) {
  const [cards, setCards] = useState<FundCard[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { listFunds('live', communityId).then(setCards).catch((e) => setErr(problemMessage(e))) }, [communityId])

  return (
    <div className="fd-tab-list">
      <div className="mc-row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p className="mc-hint" style={{ margin: 0 }}>Members help neighbours get medicine and surgery, a little at a time.</p>
        {canStart && <Link to={`/fund/new?communityId=${communityId}`} style={{ textDecoration: 'none' }}><Button><Plus size={16} /> Start a fundraiser</Button></Link>}
      </div>
      {err && <Alert tone="danger">{err}</Alert>}
      {cards === null && !err && <p className="mc-hint">Loading…</p>}
      {cards?.length === 0 && <EmptyState icon={<HeartHandshake size={22} />} title="No fundraiser in this community yet">
        {canStart ? 'When someone needs help paying for care, start one here.' : 'A doctor or health worker can start one when a patient needs help.'}</EmptyState>}
      {cards && cards.length > 0 && <div className="fd-grid" style={{ marginTop: 0 }}>{cards.map((c) => <FundCardView key={c.id} c={c} />)}</div>}
    </div>
  )
}
