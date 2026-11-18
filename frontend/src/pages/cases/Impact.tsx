import { useEffect, useState } from 'react'
import { Card, EmptyState, PageHeader } from '../../components/ui'
import { getImpact } from '../../api/cases'
import type { Impact as ImpactDto } from '../../api/cases'

export default function Impact() {
  const [d, setD] = useState<ImpactDto | null>(null)
  useEffect(() => {
    const load = () => getImpact().then(setD).catch(() => undefined)
    void load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  if (!d) return <main className="mc-page"><span className="mc-skeleton" style={{ width: '40%' }} /></main>

  const maxRegion = Math.max(1, ...d.byRegion.map((r) => r.cases))
  // Always show the last 14 days, with 0 for quiet days, so bars stay narrow and comparable.
  const byDay = new Map(d.daily.map((x) => [String(x.day).slice(0, 10), x.cases]))
  const days = Array.from({ length: 14 }, (_, i) => {
    const dt = new Date(); dt.setDate(dt.getDate() - (13 - i))
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    return { key, cases: byDay.get(key) ?? 0 }
  })
  const maxDay = Math.max(1, ...days.map((x) => x.cases))

  return (
    <main className="mc-page mc-page-wide">
      <PageHeader eyebrow="Impact" title="Where help is reaching" description="Live from the case rooms. Demo data only." />
      <section className="mc-stats mc-stats-4" aria-label="Summary">
        <div className="mc-stat"><span>Cases</span><strong>{d.totalCases}</strong></div>
        <div className="mc-stat"><span>Answered or closed</span><strong>{d.resolved}</strong></div>
        <div className="mc-stat"><span>Urgent cases</span><strong>{d.redCases}</strong></div>
        <div className="mc-stat"><span>Avg. minutes to a doctor</span><strong>{d.avgMinutesToAccept ?? '–'}</strong></div>
      </section>

      <div className="mc-layout-2">
        <Card>
          <div className="mc-card-head"><h2>Cases by area</h2><span className="mc-muted-sub">{d.open} waiting now</span></div>
          {d.byRegion.length === 0 ? <EmptyState title="No areas yet">Areas appear when cases are tagged with a region.</EmptyState> : (
            <div className="mc-bars">
              {d.byRegion.map((r) => (
                <div key={`${r.name}-${r.district}`} className="mc-bar-row">
                  <span className="mc-bar-label">{r.name}<small>{r.district}, {r.state}</small></span>
                  <span className="mc-bar-track" aria-hidden="true">
                    <span className="mc-bar-fill" style={{ width: `${(r.cases / maxRegion) * 100}%` }} />
                    <span className="mc-bar-fill is-red" style={{ width: `${(r.red_cases / maxRegion) * 100}%` }} />
                  </span>
                  <span className="mc-num">{r.cases}{r.red_cases > 0 ? ` · ${r.red_cases} urgent` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mc-card-head"><h2>Last 14 days</h2></div>
          {d.totalCases === 0 ? <EmptyState title="No activity yet">Send a case to see it here.</EmptyState> : (
            <div className="mc-spark" role="img" aria-label="Cases per day, last 14 days">
              {days.map((x) => (
                <span key={x.key} className="mc-spark-col" title={`${x.key}: ${x.cases} case${x.cases === 1 ? '' : 's'}`}>
                  <span className="mc-spark-bar" style={{ height: x.cases === 0 ? '3px' : `${Math.max(8, (x.cases / maxDay) * 100)}%`, opacity: x.cases === 0 ? 0.35 : 1 }} />
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  )
}
