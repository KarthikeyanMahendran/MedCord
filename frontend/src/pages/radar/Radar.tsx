import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, FlaskConical, MapPinned, Radar as RadarIcon, ShieldCheck, Trash2 } from 'lucide-react'
import { Alert, Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'
import type { Tone } from '../../components/ui'
import { RadarMap } from '../../components/radar/RadarMap'
import { UrgencyBadge, ago } from '../../components/cases/UrgencyBadge'
import { acknowledgeAlert, getAlert, getRadar, isLive, resetDemo, resolveAlert, runDemo } from '../../api/outbreaks'
import type { AlertDetail, OutbreakAlert, Radar } from '../../api/outbreaks'
import { problemMessage } from '../../api/client'

const sevTone: Record<OutbreakAlert['severity'], Tone> = { ALERT: 'danger', WATCH: 'warning' }
const statusLabel: Record<OutbreakAlert['status'], string> = { OPEN: 'Needs review', ACKNOWLEDGED: 'Acknowledged', RESOLVED: 'Resolved' }

function AlertRow({ a, active, onPick }: { a: OutbreakAlert; active: boolean; onPick: () => void }) {
  return (
    <button type="button" className={`rd-row ${active ? 'is-active' : ''} ${a.status === 'RESOLVED' ? 'is-done' : ''}`} onClick={onPick} aria-pressed={active}>
      <span className={`mc-dot ${a.severity === 'ALERT' ? 'mc-dot-red' : 'mc-dot-amber'}`} aria-hidden="true" />
      <span className="rd-row-main">
        <strong>{a.syndromeLabel}</strong>
        <span>{a.regionName}, {a.district} · {a.caseCount} cases · {ago(a.lastCaseAt)}</span>
      </span>
      <Badge tone={a.status === 'RESOLVED' ? 'neutral' : sevTone[a.severity]}>{a.status === 'RESOLVED' ? 'Resolved' : a.severity === 'ALERT' ? 'Alert' : 'Watch'}</Badge>
    </button>
  )
}

function Timeline({ buckets, hours }: { buckets: number[]; hours: number }) {
  const max = Math.max(1, ...buckets)
  return (
    <div className="rd-timeline" role="img" aria-label={`Cases per ${hours} hours, oldest to newest: ${buckets.join(', ')}`}>
      <div className="rd-bars">
        {buckets.map((n, i) => (
          <span key={i} className="rd-bar" title={`${n} case${n === 1 ? '' : 's'}`}>
            <i style={{ height: n === 0 ? '4px' : `${Math.max(14, (n / max) * 100)}%` }} className={n === 0 ? 'is-zero' : ''} />
            <b>{n}</b>
          </span>
        ))}
      </div>
      <div className="rd-axis"><span>{buckets.length * hours} h ago</span><span>now</span></div>
    </div>
  )
}

export default function RadarPage() {
  const [data, setData] = useState<Radar | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<AlertDetail | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const liveBefore = useRef<Set<string> | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await getRadar()
      const ids = new Set(r.alerts.filter(isLive).map((a) => a.id))
      const before = liveBefore.current
      if (before) {
        const added = r.alerts.find((a) => isLive(a) && !before.has(a.id))
        if (added) setFresh(`New possible outbreak: ${added.syndromeLabel} near ${added.regionName}.`)
      }
      liveBefore.current = ids
      setData(r)
      setSelected((cur) => (cur && r.alerts.some((a) => a.id === cur) ? cur : (r.alerts.find(isLive) ?? r.alerts[0])?.id ?? null))
    } catch (err) { setError(problemMessage(err)) }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, 12000)
    return () => clearInterval(t)
  }, [load])

  const current = data?.alerts.find((a) => a.id === selected) ?? null
  const stamp = current ? `${current.caseCount}|${current.status}|${current.severity}` : ''
  useEffect(() => {
    if (!selected) { setDetail(null); return }
    let alive = true
    getAlert(selected).then((d) => { if (alive) setDetail(d) }).catch(() => { if (alive) setDetail(null) })
    return () => { alive = false }
  }, [selected, stamp])

  async function act(key: string, fn: () => Promise<unknown>, after?: () => void) {
    setBusy(key); setError(null)
    try { await fn(); await load(); after?.() } catch (err) { setError(problemMessage(err)) } finally { setBusy(null) }
  }

  async function simulate() {
    setBusy('demo'); setError(null)
    try {
      await runDemo()
      const r = await getRadar()
      liveBefore.current = new Set(r.alerts.filter(isLive).map((a) => a.id))
      setData(r)
      const hit = r.alerts.find((a) => a.demo && isLive(a))
      if (hit) { setSelected(hit.id); setFresh(`New possible outbreak: ${hit.syndromeLabel} near ${hit.regionName}.`) }
    } catch (err) { setError(problemMessage(err)) } finally { setBusy(null) }
  }

  if (!data) return <main className="mc-page"><span className="mc-skeleton" style={{ width: '40%' }} />{error && <Alert tone="danger">{error}</Alert>}</main>

  const live = data.alerts.filter(isLive)
  const resolved = data.alerts.filter((a) => !isLive(a))
  const needReview = live.filter((a) => a.status === 'OPEN').length
  const cases72 = data.regions.reduce((n, r) => n + r.cases72h, 0)
  const demoActive = data.alerts.some((a) => a.demo)

  return (
    <main className="mc-page mc-page-wide">
      <PageHeader eyebrow="Early warning" title="Outbreak radar"
        description={`Watches every case. When 3 or more similar cases appear in the same area within ${data.windowHours} hours, it raises an alert. Rule-based, never a diagnosis.`}
        actions={data.isAdmin ? (
          <>
            <Button variant="secondary" onClick={simulate} loading={busy === 'demo'}><FlaskConical size={15} /> Simulate outbreak</Button>
            {demoActive && <Button variant="ghost" onClick={() => act('reset', resetDemo, () => { liveBefore.current = null })} loading={busy === 'reset'}><Trash2 size={15} /> Reset demo</Button>}
          </>
        ) : undefined} />

      {error && <Alert tone="danger">{error}</Alert>}
      {fresh && (
        <div className="rd-fresh" role="alert">
          <RadarIcon size={18} /><strong>{fresh}</strong>
          <button type="button" onClick={() => setFresh(null)} aria-label="Dismiss">Dismiss</button>
        </div>
      )}

      <section className="mc-stats mc-stats-4" aria-label="Summary">
        <div className="mc-stat"><span>Active alerts</span><strong className={live.length > 0 ? 'rd-hot' : ''}>{live.length}</strong></div>
        <div className="mc-stat"><span>Need review</span><strong>{needReview}</strong></div>
        <div className="mc-stat"><span>Cases in {data.windowHours} h</span><strong>{cases72}</strong></div>
        <div className="mc-stat"><span>Areas watched</span><strong>{data.regions.length}</strong></div>
      </section>

      <div className="rd-grid">
        <Card>
          <div className="mc-card-head"><h2><MapPinned size={14} style={{ verticalAlign: -2 }} /> Live map</h2><span className="mc-muted-sub">{live.length === 0 ? 'All quiet' : `${live.length} active`}</span></div>
          <RadarMap regions={data.regions} alerts={data.alerts} selectedId={selected} onSelect={setSelected} />
        </Card>

        <div className="rd-side">
          <Card>
            <div className="mc-card-head"><h2>Alerts</h2><span className="mc-muted-sub">{resolved.length > 0 ? `${resolved.length} resolved this week` : 'Updates every few seconds'}</span></div>
            {data.alerts.length === 0 ? (
              <EmptyState title="All quiet" icon={<ShieldCheck size={18} />}>No cluster of similar cases right now. The radar keeps watching every new case.</EmptyState>
            ) : (
              <div className="rd-list">{data.alerts.map((a) => <AlertRow key={a.id} a={a} active={a.id === selected} onPick={() => setSelected(a.id)} />)}</div>
            )}
          </Card>

          {current && detail && detail.alert.id === current.id && (
            <Card>
              <div className="mc-card-head">
                <h2>{detail.alert.syndromeLabel}</h2>
                <span className="rd-badges">
                  <Badge tone={sevTone[detail.alert.severity]}>{detail.alert.severity === 'ALERT' ? 'Alert' : 'Watch'}</Badge>
                  <Badge tone={detail.alert.status === 'OPEN' ? 'warning' : detail.alert.status === 'ACKNOWLEDGED' ? 'info' : 'neutral'}>{statusLabel[detail.alert.status]}</Badge>
                  {detail.alert.demo && <Badge tone="neutral">Demo</Badge>}
                </span>
              </div>
              <div className="rd-detail">
                <p className="rd-where"><strong>{detail.alert.regionName}</strong>, {detail.alert.district}, {detail.alert.state}</p>
                <p className="mc-muted-sub">{detail.alert.caseCount} similar cases{detail.alert.redCount > 0 ? `, ${detail.alert.redCount} urgent` : ''}. First {ago(detail.alert.firstCaseAt)}, latest {ago(detail.alert.lastCaseAt)}. Rule: {detail.alert.threshold}+ in {data.windowHours} h.</p>

                <Timeline buckets={detail.timeline} hours={detail.bucketHours} />

                <h3 className="rd-h3">What to do</h3>
                <ul className="rd-steps">
                  {detail.guidance.map((g, i) => <li key={i}><CheckCircle2 size={15} /><span>{g}</span></li>)}
                </ul>
                <p className="rd-disclaimer">{detail.disclaimer}</p>

                {detail.canSeeCases && detail.cases.length > 0 && (
                  <>
                    <h3 className="rd-h3">Cases in this cluster</h3>
                    <div className="rd-cases">
                      {detail.cases.map((c, i) => (
                        <div key={i} className="rd-case">
                          <UrgencyBadge urgency={c.urgency} />
                          <span><strong>{c.village ?? 'Unknown village'}</strong>{c.age != null ? `, ${c.age} y` : ''}{c.sex ? `, ${c.sex}` : ''}<small>{c.summary}</small></span>
                          <time>{ago(c.createdAt)}</time>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {detail.alert.status === 'ACKNOWLEDGED' && (
                  <p className="rd-ack"><ShieldCheck size={14} /> Acknowledged by {detail.alert.acknowledgedBy ?? 'a doctor'}{detail.alert.acknowledgedAt ? ` ${ago(detail.alert.acknowledgedAt)}` : ''}{detail.alert.note ? `: “${detail.alert.note}”` : ''}</p>
                )}

                {data.canManage && detail.alert.status !== 'RESOLVED' && (
                  <div className="rd-actions">
                    {detail.alert.status === 'OPEN' && (
                      <>
                        <input className="mc-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional note, e.g. district officer informed" aria-label="Note" />
                        <Button onClick={() => act('ack', () => acknowledgeAlert(detail.alert.id, note), () => setNote(''))} loading={busy === 'ack'}>Acknowledge</Button>
                      </>
                    )}
                    {data.isAdmin && <Button variant="secondary" onClick={() => act('resolve', () => resolveAlert(detail.alert.id))} loading={busy === 'resolve'}>Mark resolved</Button>}
                  </div>
                )}
                {!data.canManage && <p className="rd-disclaimer">Health notice for your area. Your doctor or programme admin is reviewing this.</p>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}
