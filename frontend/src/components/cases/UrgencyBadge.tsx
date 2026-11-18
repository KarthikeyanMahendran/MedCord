import { Badge } from '../ui'
import type { Tone } from '../ui'
import type { CaseStatus, Urgency } from '../../api/cases'

const tone: Record<Urgency, Tone> = { RED: 'danger', AMBER: 'warning', GREEN: 'success' }
const label: Record<Urgency, string> = { RED: 'Urgent', AMBER: 'Soon', GREEN: 'Routine' }

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return <Badge tone={tone[urgency]}>{label[urgency]}</Badge>
}

const statusTone: Record<CaseStatus, Tone> = { OPEN: 'warning', ASSIGNED: 'info', IN_CONSULT: 'info', RESOLVED: 'success', CLOSED: 'neutral' }
const statusLabel: Record<CaseStatus, string> = { OPEN: 'Waiting for doctor', ASSIGNED: 'Doctor reviewing', IN_CONSULT: 'In consult', RESOLVED: 'Answered', CLOSED: 'Closed' }

export function StatusBadge({ status }: { status: CaseStatus }) {
  return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>
}

export const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
