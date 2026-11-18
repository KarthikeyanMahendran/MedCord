import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { Alert, Button, Card, EmptyState, Textarea } from '../../components/ui'
import { CaseChat } from '../../components/cases/CaseChat'
import { StatusBadge, UrgencyBadge, ago } from '../../components/cases/UrgencyBadge'
import { acceptCase, answerCase, followUp, getCase } from '../../api/cases'
import type { CaseRoom as CaseRoomDto } from '../../api/cases'
import { problemMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

export default function CaseRoom() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const [c, setC] = useState<CaseRoomDto | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState('')
  const lang = (() => { try { return localStorage.getItem('mc_lang') ?? 'en-IN' } catch { return 'en-IN' } })()

  const load = useCallback(async () => {
    try { setC(await getCase(id)) } catch { setMissing(true) }
  }, [id])

  useEffect(() => {
    void load()
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, 6000)
    return () => clearInterval(t)
  }, [load])

  async function act(fn: () => Promise<CaseRoomDto>, done?: () => void) {
    setBusy(true); setError(null)
    try { setC(await fn()); done?.() } catch (err) { setError(problemMessage(err)) } finally { setBusy(false) }
  }

  if (missing) return <main className="mc-page"><EmptyState title="Case not found">It may have been removed or you may not have access.</EmptyState></main>
  if (!c || !user) return <main className="mc-page"><span className="mc-skeleton" style={{ width: '40%' }} /></main>

  const isDoctor = user.verificationStatus === 'APPROVED'
  const isReporter = c.reporterId === user.id
  const isAssigned = c.assignedDoctorId === user.id
  const canAccept = isDoctor && !isReporter && c.status === 'OPEN'
  const canAnswer = isAssigned && (c.status === 'ASSIGNED' || c.status === 'IN_CONSULT')
  const canFollowUp = isReporter && c.status === 'RESOLVED'

  return (
    <main className="mc-page mc-page-wide">
      <div><Link to="/cases" className="mc-backlink"><ArrowLeft size={14} /> Case rooms</Link></div>
      <div className="mc-casegrid">
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          {error && <Alert tone="danger">{error}</Alert>}
          {c.redFlags.length > 0 && (
            <div className="mc-redflag" role="alert">
              <TriangleAlert size={20} />
              <div><strong>{c.redFlags.map((f) => f.label).join(' · ')}</strong><p>{c.redFlags[0].advice}</p></div>
            </div>
          )}
          <Card>
            <div className="mc-card-head">
              <h2>{c.specialtyNeeded}</h2>
              <span className="mc-row" style={{ gap: 6 }}><UrgencyBadge urgency={c.urgency} /><StatusBadge status={c.status} /></span>
            </div>
            <dl className="mc-dl" style={{ padding: 20, gridTemplateColumns: '120px 1fr' }}>
              <dt>Situation</dt><dd>{c.sbar?.situation ?? c.chiefComplaint}</dd>
              <dt>Background</dt><dd>{c.sbar?.background}</dd>
              <dt>Assessment</dt><dd>{c.sbar?.assessment}</dd>
              <dt>Recommendation</dt><dd>{c.sbar?.recommendation}</dd>
              <dt>Reported by</dt><dd>{c.reporterName} · {ago(c.createdAt)}</dd>
              <dt>Doctor</dt><dd>{c.assignedDoctorName ?? 'Not yet accepted'}{c.escalationLevel > 0 && !c.assignedDoctorName ? ' · escalated' : ''}</dd>
            </dl>
          </Card>

          {canAccept && (
            <Card><div className="mc-card-body mc-row" style={{ justifyContent: 'space-between' }}>
              <span>This case is waiting for a {c.specialtyNeeded} doctor.</span>
              <Button loading={busy} onClick={() => act(() => acceptCase(c.id))}>Accept case</Button>
            </div></Card>
          )}

          {canAnswer && (
            <Card>
              <div className="mc-card-head"><h2>Send your answer</h2></div>
              <div style={{ padding: 20, display: 'grid', gap: 12 }}>
                <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} aria-label="Your answer" placeholder="Advice for the health worker. It is added, anonymised, to the Verified Answer Library." />
                <div><Button loading={busy} disabled={!answer.trim()} onClick={() => act(() => answerCase(c.id, answer.trim()), () => setAnswer(''))}>Send and mark resolved</Button></div>
              </div>
            </Card>
          )}

          {canFollowUp && (
            <Card>
              <div className="mc-card-head"><h2>How is the patient now?</h2></div>
              <div className="mc-card-body mc-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" loading={busy} onClick={() => act(() => followUp(c.id, 'IMPROVED'))}>Better</Button>
                <Button variant="secondary" loading={busy} onClick={() => act(() => followUp(c.id, 'SAME'))}>Same</Button>
                <Button variant="danger" loading={busy} onClick={() => act(() => followUp(c.id, 'WORSE'))}>Worse</Button>
              </div>
            </Card>
          )}
        </div>

        <Card>
          <div className="mc-card-head"><h2>Case chat</h2></div>
          <CaseChat channelId={c.channelId} lang={lang} meId={user.id} readOnly={c.status === 'CLOSED'} />
        </Card>
      </div>
    </main>
  )
}
