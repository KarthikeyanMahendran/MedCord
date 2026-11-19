import { useMemo } from 'react'
import type { KeyboardEvent } from 'react'
import { dotGrid, makeProjection } from '../../lib/indiaMap'
import { isLive } from '../../api/outbreaks'
import type { OutbreakAlert, RegionPoint } from '../../api/outbreaks'

const W = 600, H = 640

interface Props {
  regions: RegionPoint[]
  alerts: OutbreakAlert[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/** Dotted map of India. Live alerts pulse (red = ALERT, amber = WATCH); quiet areas are small blue dots. */
export function RadarMap({ regions, alerts, selectedId, onSelect }: Props) {
  const proj = useMemo(() => makeProjection(W, H, 14), [])
  const dots = useMemo(() => {
    const pts = dotGrid(proj, W, H, 8)
    // One path with round caps = thousands of dots for the price of one element.
    return pts.map((p) => `M${p.x.toFixed(1)} ${p.y.toFixed(1)}h0`).join('')
  }, [proj])

  const live = alerts.filter(isLive)
  const byRegion = new Map<string, OutbreakAlert[]>()
  for (const a of live) byRegion.set(a.regionId, [...(byRegion.get(a.regionId) ?? []), a])

  const onKey = (id: string) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id) } }

  return (
    <div className="rd-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Map of monitored areas and outbreak alerts" preserveAspectRatio="xMidYMid meet">
        <path d={dots} className="rd-dots" />

        {regions.filter((r) => r.lat != null && r.lng != null && !byRegion.has(r.id)).map((r) => {
          const { x, y } = proj.project(r.lng!, r.lat!)
          return (
            <g key={r.id} className="rd-quiet">
              <circle cx={x} cy={y} r={r.cases72h > 0 ? 4.5 : 3} />
              <title>{`${r.name}, ${r.district}: ${r.cases72h} case${r.cases72h === 1 ? '' : 's'} in 72 h. No cluster.`}</title>
            </g>
          )
        })}

        {[...byRegion.entries()].flatMap(([regionId, list]) => list.map((a, i) => {
          if (a.lat == null || a.lng == null) return null
          const base = proj.project(a.lng, a.lat)
          // Two clusters in one area are fanned out so both stay clickable.
          const ang = (i / Math.max(1, list.length)) * Math.PI * 2
          const x = base.x + (list.length > 1 ? Math.cos(ang) * 12 : 0), y = base.y + (list.length > 1 ? Math.sin(ang) * 12 : 0)
          const r = 7 + Math.min(a.caseCount, 12) * 1.1
          const cls = `rd-alert ${a.severity === 'ALERT' ? 'is-alert' : 'is-watch'} ${a.status === 'ACKNOWLEDGED' ? 'is-ack' : ''} ${selectedId === a.id ? 'is-selected' : ''}`
          return (
            <g key={a.id} className={cls} role="button" tabIndex={0} onClick={() => onSelect(a.id)} onKeyDown={onKey(a.id)}
              aria-label={`${a.severity === 'ALERT' ? 'Alert' : 'Watch'}: ${a.syndromeLabel} near ${a.regionName}, ${a.caseCount} cases`}>
              <circle cx={x} cy={y} r={r} className="rd-ring rd-ring-1" />
              <circle cx={x} cy={y} r={r} className="rd-ring rd-ring-2" />
              <circle cx={x} cy={y} r={r * 0.55} className="rd-core" />
              <text x={x} y={y + 3.5} className="rd-count" textAnchor="middle">{a.caseCount}</text>
              <circle cx={x} cy={y} r={r + 7} className="rd-hit" />
              <text x={x + r + 9} y={y + 4} className="rd-label" data-region={regionId}>{a.regionName}</text>
            </g>
          )
        }))}
      </svg>
      <ul className="rd-legend" aria-label="Legend">
        <li><i className="is-alert" /> Alert</li>
        <li><i className="is-watch" /> Watch</li>
        <li><i className="is-quiet" /> No cluster</li>
      </ul>
    </div>
  )
}
