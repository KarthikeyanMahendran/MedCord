import type { FundCard, FundNeed, FundStatus } from '../api/fundraisers'

/** ₹1,23,456 in the Indian grouping. */
export const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)

export const percent = (raised: number, goal: number) => (goal <= 0 ? 0 : Math.min(100, Math.round((raised / goal) * 100)))

export const NEED_LABEL: Record<FundNeed, string> = { MEDICINE: 'Medicine', SURGERY: 'Surgery', TESTS: 'Tests & scans', TRANSPORT: 'Transport', OTHER: 'Other care' }
export const NEED_ICON: Record<FundNeed, string> = { MEDICINE: '💊', SURGERY: '🏥', TESTS: '🔬', TRANSPORT: '🚑', OTHER: '🤝' }

export const STATUS_LABEL: Record<FundStatus, string> = {
  PENDING: 'Waiting for doctor review', ACTIVE: 'Raising now', FUNDED: 'Goal reached', CLOSED: 'Closed', REJECTED: 'Needs changes',
}

export function timeLeft(c: Pick<FundCard, 'daysLeft' | 'status'>): string | null {
  if (c.status !== 'ACTIVE' || c.daysLeft === null) return null
  if (c.daysLeft < 0) return 'Ended'
  if (c.daysLeft === 0) return 'Last day'
  return `${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} left`
}
