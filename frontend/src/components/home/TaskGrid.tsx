import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HandHeart, HeartHandshake, HeartPulse, MapPin, MessageCircle, Radar, ShieldCheck, Stethoscope, Users, FilePlus2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { caseQueue, myCases } from '../../api/cases'

interface Task { to: string; title: string; hint: string; Icon: LucideIcon; tone: string; badge?: number; primary?: boolean }

/** "What would you like to do?": the few things each kind of user does most, in plain words. */
export function TaskGrid() {
  const { user } = useAuth()
  const [waiting, setWaiting] = useState<number | null>(null)
  const isWorker = user?.accountType === 'HEALTH_WORKER'
  const isAdmin = user?.platformRole === 'ADMIN'
  const isDoctor = !isWorker && (user?.verificationStatus === 'APPROVED' || isAdmin)

  useEffect(() => {
    if (!user) return
    const load = isWorker ? myCases() : isDoctor ? caseQueue() : null
    load?.then((c) => setWaiting(isWorker ? c.filter((x) => x.status !== 'RESOLVED' && x.status !== 'CLOSED').length : c.length)).catch(() => setWaiting(null))
  }, [user, isWorker, isDoctor])

  const tasks: Task[] = isWorker ? [
    { to: '/cases/new', title: 'Send a patient case', hint: 'Speak, type or tap symptoms. A doctor will answer.', Icon: FilePlus2, tone: 'blue', primary: true },
    { to: '/cases', title: 'My cases', hint: 'See answers and follow up.', Icon: Stethoscope, tone: 'teal', badge: waiting ?? undefined },
    { to: '/dispatch', title: 'Ask for help', hint: 'A ride, medicine or a visit.', Icon: HandHeart, tone: 'orange' },
    { to: '/fund', title: 'Raise funds', hint: 'Help a patient pay for care.', Icon: HeartHandshake, tone: 'pink' },
    { to: '/checkin', title: 'How are you today?', hint: 'A quick check-in with your circle.', Icon: HeartPulse, tone: 'purple' },
    { to: '/messages', title: 'Messages', hint: 'Talk to a doctor or colleague.', Icon: MessageCircle, tone: 'slate' },
  ] : [
    { to: '/cases', title: isDoctor ? 'Cases waiting for you' : 'Patient cases', hint: isDoctor ? 'Accept a case and answer it.' : 'Cases from health workers.', Icon: Stethoscope, tone: 'blue', badge: waiting ?? undefined, primary: true },
    { to: '/messages', title: 'Messages', hint: 'Talk to colleagues.', Icon: MessageCircle, tone: 'teal' },
    { to: '/communities', title: 'Communities', hint: 'Join or start a group.', Icon: Users, tone: 'slate' },
    { to: '/fund', title: 'Care Fund', hint: 'Back a patient’s treatment.', Icon: HeartHandshake, tone: 'pink' },
    { to: '/dispatch', title: 'Volunteer help', hint: 'Help someone nearby.', Icon: HandHeart, tone: 'orange' },
    { to: '/radar', title: 'Outbreak radar', hint: 'See clusters of similar cases.', Icon: Radar, tone: 'red' },
    ...(isAdmin ? [{ to: '/admin/verifications', title: 'Verify doctors', hint: 'Review licences.', Icon: ShieldCheck, tone: 'purple' } as Task] : [{ to: '/network', title: 'Care network map', hint: 'Who is working where.', Icon: MapPin, tone: 'purple' } as Task]),
  ]

  return (
    <section aria-labelledby="task-heading" className="th-section">
      <h2 id="task-heading" className="th-title">What would you like to do?</h2>
      <div className="th-grid">
        {tasks.map(({ to, title, hint, Icon, tone, badge, primary }) => (
          <Link key={to + title} to={to} className={`th-tile th-${tone} ${primary ? 'is-primary' : ''}`}>
            <span className="th-icon" aria-hidden="true"><Icon size={26} /></span>
            <span className="th-text"><strong>{title}</strong><span>{hint}</span></span>
            {badge !== undefined && badge > 0 && <span className="th-badge" aria-label={`${badge} waiting`}>{badge}</span>}
          </Link>
        ))}
      </div>
    </section>
  )
}
