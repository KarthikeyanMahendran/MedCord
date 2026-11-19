import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeartHandshake } from 'lucide-react'
import { Button, Modal } from '../ui'
import { ProgressBar } from './FundCardView'
import { listFunds } from '../../api/fundraisers'
import type { FundCard } from '../../api/fundraisers'
import { NEED_ICON, inr, percent, timeLeft } from '../../lib/fund'

const seenKey = (id: string) => `fund-popup:${id}`
const wasSeen = (id: string) => { try { return sessionStorage.getItem(seenKey(id)) === '1' } catch { return false } }
const markSeen = (id: string) => { try { sessionStorage.setItem(seenKey(id), '1') } catch { /* private mode: it just shows again */ } }

/** Shown once per visit when a community has fundraisers that are still raising, so members see who needs help. */
export function FundPopup({ communityId, communityName }: { communityId: string; communityName: string }) {
  const [cards, setCards] = useState<FundCard[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (wasSeen(communityId)) return
    let live = true
    listFunds('live', communityId).then((all) => {
      const raising = all.filter((c) => c.status === 'ACTIVE' && (c.daysLeft === null || c.daysLeft >= 0))
      if (live && raising.length > 0) { setCards(raising.slice(0, 3)); setOpen(true) }
    }).catch(() => undefined)
    return () => { live = false }
  }, [communityId])

  const close = () => { markSeen(communityId); setOpen(false) }
  if (cards.length === 0) return null

  return (
    <Modal isOpen={open} onClose={close} title={`Help someone in ${communityName}`}
      footer={<><Button variant="secondary" onClick={close}>Maybe later</Button><Link to="/fund" onClick={close} style={{ textDecoration: 'none' }}><Button variant="secondary">See all</Button></Link></>}>
      <p className="mc-hint" style={{ marginTop: 0 }}>
        <HeartHandshake size={14} style={{ verticalAlign: '-2px' }} /> {cards.length === 1 ? 'A neighbour in your community needs help with care costs.' : 'Neighbours in your community need help with care costs.'} Even ₹10 helps.
      </p>
      <div className="fd-popup-list">
        {cards.map((c) => (
          <Link key={c.id} to={`/fund/${c.id}`} onClick={close} className="fd-popup-item">
            <strong><span aria-hidden="true">{NEED_ICON[c.need]}</span> {c.title}</strong>
            <span className="fd-for">For {c.beneficiary}</span>
            <ProgressBar raised={c.raisedAmount} goal={c.goalAmount} />
            <span className="fd-nums"><span><strong>{inr(c.raisedAmount)}</strong> of {inr(c.goalAmount)} · {percent(c.raisedAmount, c.goalAmount)}%</span><span>{timeLeft(c) ?? ''}</span></span>
            <span className="fd-popup-cta">Give now →</span>
          </Link>
        ))}
      </div>
    </Modal>
  )
}
