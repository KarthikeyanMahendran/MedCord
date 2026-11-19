import { Link } from 'react-router-dom'
import { BadgeCheck, Users } from 'lucide-react'
import { Badge } from '../ui'
import type { Tone } from '../ui'
import type { FundCard, FundStatus } from '../../api/fundraisers'
import { NEED_ICON, NEED_LABEL, STATUS_LABEL, inr, percent, timeLeft } from '../../lib/fund'

const tone: Record<FundStatus, Tone> = { PENDING: 'warning', ACTIVE: 'info', FUNDED: 'success', CLOSED: 'neutral', REJECTED: 'danger' }

export function ProgressBar({ raised, goal }: { raised: number; goal: number }) {
  const p = percent(raised, goal)
  return (
    <div className="fd-bar" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={`${p}% of the goal raised`}>
      <span style={{ width: `${p}%` }} className={p >= 100 ? 'is-done' : ''} />
    </div>
  )
}

export function FundCardView({ c }: { c: FundCard }) {
  const left = timeLeft(c)
  return (
    <Link to={`/fund/${c.id}`} className="fd-card">
      <div className="fd-card-top">
        <span className="fd-need"><span aria-hidden="true">{NEED_ICON[c.need]}</span> {NEED_LABEL[c.need]}</span>
        {c.status !== 'ACTIVE' && <Badge tone={tone[c.status]}>{STATUS_LABEL[c.status]}</Badge>}
      </div>
      <h3>{c.title}</h3>
      <p className="fd-for">For {c.beneficiary} · in {c.communityName}</p>
      <ProgressBar raised={c.raisedAmount} goal={c.goalAmount} />
      <div className="fd-nums">
        <span><strong>{inr(c.raisedAmount)}</strong> raised of {inr(c.goalAmount)}</span>
        <span>{percent(c.raisedAmount, c.goalAmount)}%</span>
      </div>
      <div className="fd-foot">
        <span><Users size={13} /> {c.supporters} supporter{c.supporters === 1 ? '' : 's'}</span>
        {left && <span>{left}</span>}
        <span className="fd-by">{c.organiserDoctor && <BadgeCheck size={13} aria-label="Verified doctor" />} {c.organiserName}</span>
      </div>
    </Link>
  )
}
