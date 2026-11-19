import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ChevronRight, Plus, Radar, Stethoscope, WifiOff } from 'lucide-react'
import { Alert, Button, Card, EmptyState, PageHeader, Tabs } from '../../components/ui'
import { StatusBadge, UrgencyBadge, ago } from '../../components/cases/UrgencyBadge'
import { caseQueue, listNotifications, markNotificationRead, myCases, setAvailability } from '../../api/cases'
import type { AppNotification, CaseRoom } from '../../api/cases'
import { getRadar, isLive } from '../../api/outbreaks'
import type { OutbreakAlert } from '../../api/outbreaks'
import { useAuth } from '../../context/AuthContext'
import { flushQueue, queuedCount } from '../../lib/offlineQueue'

type Tab = 'queue' | 'mine'

function CaseRow({ c }: { c: CaseRoom }) {
  return (
    <Link to={`/cases/${c.id}`} className="mc-list-row">
      <span className={`mc-dot mc-dot-${c.urgency.toLowerCase()}`} aria-hidden="true" />
      <span className="mc-list-main">
        <strong style={{ fontWeight: 500 }}>{c.specialtyNeeded}{c.village ? ` · ${c.village}` : ''}</strong>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sbar?.situation ?? c.chiefComplaint}</span>
      </span>
      <UrgencyBadge urgency={c.urgency} />
      <StatusBadge status={c.status} />
      <span className="mc-list-meta">{ago(c.createdAt)}</span>
      <ChevronRight size={16} />
    </Link>
  )
}

export default function CasesHome() {
  const { user } = useAuth()
  const isDoctor = user?.verificationStatus === 'APPROVED'
  const [tab, setTab] = useState<Tab>(isDoctor ? 'queue' : 'mine')
  const [queue, setQueue] = useState<CaseRoom[] | null>(null)
  const [mine, setMine] = useState<CaseRoom[] | null>(null)
  const [notes, setNotes] = useState<AppNotification[]>([])
  const [onDuty, setOnDuty] = useState(false)
  const [pending, setPending] = useState(queuedCount())
  const [notice, setNotice] = useState<string | null>(null)
  const [outbreak, setOutbreak] = useState<OutbreakAlert | null>(null)

  const load = useCallback(() => {
    myCases().then(setMine).catch(() => setMine([]))
    if (isDoctor) caseQueue().then(setQueue).catch(() => setQueue([]))
    listNotifications().then(setNotes).catch(() => undefined)
    // Early warning: show the most serious live outbreak alert, if any.
    getRadar().then((r) => setOutbreak(r.alerts.filter(isLive).sort((a, b) => Number(b.severity === 'ALERT') - Number(a.severity === 'ALERT'))[0] ?? null)).catch(() => undefined)
  }, [isDoctor])

  const flush = useCallback(async () => {
    if (queuedCount() === 0) return
    const sent = await flushQueue()
    setPending(queuedCount())
    if (sent > 0) { setNotice(`${sent} saved case${sent > 1 ? 's were' : ' was'} sent.`); load() }
  }, [load])

  useEffect(() => {
    load(); void flush()
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') load() }, 10000)
    const online = () => { void flush() }
    window.addEventListener('online', online)
    return () => { clearInterval(t); window.removeEventListener('online', online) }
  }, [load, flush])

  async function toggleDuty() {
    const next = !onDuty
    setOnDuty(next)
    try { await setAvailability(next, ['en', 'ta']) } catch { setOnDuty(!next) }
  }

  const unread = notes.filter((n) => !n.read)
  const shown = tab === 'queue' ? queue : mine

  return (
    <main className="mc-page mc-page-wide">
      <PageHeader eyebrow="Rural case rooms" title="Case rooms" description="Health workers send cases. Verified specialists answer in the chat."
        actions={<>
          {isDoctor && <Button variant={onDuty ? 'primary' : 'secondary'} onClick={toggleDuty} aria-pressed={onDuty}><Stethoscope size={15} /> {onDuty ? 'On duty' : 'Go on duty'}</Button>}
          <Link to="/cases/new"><Button><Plus size={15} /> New case</Button></Link>
        </>} />

      {notice && <Alert tone="success">{notice}</Alert>}
      {outbreak && (
        <Link to="/radar" className={`rd-banner ${outbreak.severity === 'ALERT' ? '' : 'is-watch'}`}>
          <Radar size={18} />
          <span><strong>Possible outbreak:</strong> {outbreak.syndromeLabel} near {outbreak.regionName} <em>· {outbreak.caseCount} cases in 72 h</em></span>
          <ChevronRight size={16} />
        </Link>
      )}
      {pending > 0 && (
        <Alert tone="info"><WifiOff size={15} style={{ marginRight: 8 }} />{pending} case{pending > 1 ? 's are' : ' is'} saved on this device and will send when you are online.</Alert>
      )}

      <div className="mc-layout-2">
        <Card>
          <div className="mc-card-head">
            <Tabs label="Cases" value={tab} onChange={setTab}
              items={[...(isDoctor ? [{ value: 'queue' as const, label: 'Waiting for a doctor', count: queue?.length }] : []), { value: 'mine' as const, label: 'My cases', count: mine?.length }]} />
          </div>
          {shown === null ? <div style={{ padding: 20 }}><span className="mc-skeleton" style={{ width: '60%' }} /></div>
            : shown.length === 0 ? <EmptyState title={tab === 'queue' ? 'No cases waiting' : 'No cases yet'} icon={<Stethoscope size={18} />}
                action={tab === 'mine' ? <Link to="/cases/new"><Button size="sm">Send a case</Button></Link> : undefined}>
                {tab === 'queue' ? 'New cases for your specialty appear here, most urgent first.' : 'Cases you send or answer appear here.'}</EmptyState>
            : <div className="mc-list">{shown.map((c) => <CaseRow key={c.id} c={c} />)}</div>}
        </Card>

        <Card>
          <div className="mc-card-head"><h2><Bell size={14} style={{ verticalAlign: -2 }} /> Notifications</h2>{unread.length > 0 && <span className="mc-muted-sub">{unread.length} new</span>}</div>
          {notes.length === 0 ? <EmptyState title="Nothing yet">Case offers, answers and follow-ups show up here.</EmptyState> : (
            <div className="mc-list">
              {notes.slice(0, 8).map((n) => (
                <Link key={n.id} to={n.kind === 'OUTBREAK' ? '/radar' : n.fundraiserId ? `/fund/${n.fundraiserId}` : n.caseId ? `/cases/${n.caseId}` : '/cases'} className="mc-list-row" style={{ opacity: n.read ? 0.6 : 1 }}
                  onClick={() => { if (!n.read) void markNotificationRead(n.id) }}>
                  <span className="mc-list-main"><strong style={{ fontWeight: 500 }}>{n.title}</strong><span>{n.body}</span></span>
                  <span className="mc-list-meta">{ago(n.createdAt)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  )
}
