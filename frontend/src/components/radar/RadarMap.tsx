import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { KX } from '../../lib/indiaMap'
import { STATES } from '../../lib/indiaStates'
import { isLive } from '../../api/outbreaks'
import type { OutbreakAlert, RegionPoint } from '../../api/outbreaks'

const W = 600, H = 680
const LON0 = 67.5, LON1 = 97.8, LAT0 = 6, LAT1 = 37.2

const norm = (n: string) => n.toLowerCase().replace(/&/g, 'and').replace(/\(.*\)/, '').replace(/[^a-z]/g, '')
/** Does a region's state name (from the database) belong to this map shape? */
const sameState = (a: string, b: string) => { const x = norm(a), y = norm(b); return x === y || x.startsWith(y) || y.startsWith(x) }

function makeProj() {
  const sx = (LON1 - LON0) * KX, sy = LAT1 - LAT0
  const scale = Math.min((W - 8) / sx, (H - 8) / sy)
  const ox = (W - sx * scale) / 2, oy = (H - sy * scale) / 2
  return { scale, project: (lon: number, lat: number) => ({ x: ox + (lon - LON0) * KX * scale, y: oy + (LAT1 - lat) * scale }) }
}

interface Props {
  regions: RegionPoint[]
  alerts: OutbreakAlert[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/** Dotted map of India. Live alerts pulse (red = ALERT, amber = WATCH); quiet areas are small blue dots. */
export function RadarMap({ regions, alerts, selectedId, onSelect }: Props) {
  const proj = useMemo(makeProj, [])
  const shapes = useMemo(() => STATES.map((st) => {
    const d = st.rings.map((r) => 'M' + r.map(([lo, la]) => { const q = proj.project(lo, la); return `${q.x.toFixed(1)} ${q.y.toFixed(1)}` }).join('L') + 'Z').join('')
    const xs = st.rings.flat().map((q) => q[0]), width = (Math.max(...xs) - Math.min(...xs)) * KX * proj.scale
    return { name: st.name, d, c: proj.project(st.c[0], st.c[1]), width }
  }), [proj])
  const [active, setActive] = useState<string | null>(null)
  const [view, setView] = useState({ rx: 48, rz: -10 })
  const drag = useRef<{ x: number; y: number; rx: number; rz: number } | null>(null)
  const onDown = (e: React.PointerEvent) => { if ((e.target as Element).closest('.rd-alert, .rd-state')) return; drag.current = { x: e.clientX, y: e.clientY, ...view } }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return
    setView({ rz: Math.max(-45, Math.min(45, d.rz + (e.clientX - d.x) * 0.25)), rx: Math.max(0, Math.min(70, d.rx - (e.clientY - d.y) * 0.25)) })
  }
  const [pinned, setPinned] = useState(false)   // a click/tap keeps the state selected until another is chosen

  const live = alerts.filter(isLive)
  const byRegion = new Map<string, OutbreakAlert[]>()
  for (const a of live) byRegion.set(a.regionId, [...(byRegion.get(a.regionId) ?? []), a])

  const onKey = (id: string) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id) } }

  const info = active ? (() => {
    const inState = regions.filter((r) => sameState(r.state, active))
    const alertsHere = live.filter((a) => sameState(a.state, active))
    return { cases: inState.reduce((n, r) => n + r.cases72h, 0), areas: inState.length, alerts: alertsHere }
  })() : null

  return (
    <div className="rd-map">
      <div className="rd-readout" aria-live="polite">
        {active && info ? (
          <>
            <strong>{active}</strong>
            <span>{info.alerts.length ? `${info.alerts.length} live alert${info.alerts.length === 1 ? '' : 's'}` : 'No live alert'}{info.areas ? ` · ${info.cases} case${info.cases === 1 ? '' : 's'} in 72 h across ${info.areas} watched area${info.areas === 1 ? '' : 's'}` : ' · no watched area yet'}</span>
            {info.alerts.map((a) => <button key={a.id} type="button" onClick={() => onSelect(a.id)}>{a.syndromeLabel}, {a.regionName}</button>)}
          </>
        ) : <span>Touch or hover a state to see its name and status.</span>}
      </div>
      <div className="rd-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}>
      <div className="rd-scene" style={{ transform: `rotateX(${view.rx}deg) rotateZ(${view.rz}deg)` }}>
      {Array.from({ length: 12 }, (_, i) => (
        <svg key={i} viewBox={`0 0 ${W} ${H}`} className="rd-depth" aria-hidden="true" style={{ transform: `translateZ(${-(i + 1) * 2.5}px)` }}>
          {shapes.map((st) => <path key={st.name} d={st.d} />)}
        </svg>
      ))}
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Map of monitored areas and outbreak alerts" preserveAspectRatio="xMidYMid meet">
        <g className="rd-states">
          {shapes.map((st) => {
            const here = live.filter((a) => sameState(a.state, st.name))
            const lvl = here.some((a) => a.severity === 'ALERT') ? 'is-alert' : here.length ? 'is-watch' : ''
            return (
              <path key={st.name} d={st.d} className={`rd-state ${lvl} ${active === st.name ? 'is-active' : ''}`}
                onMouseEnter={() => { if (!pinned) setActive(st.name) }} onMouseLeave={() => { if (!pinned) setActive(null) }}
                onClick={() => { setActive(st.name); setPinned(true) }}>
                <title>{st.name}</title>
              </path>
            )
          })}
        </g>
        <g className="rd-names" aria-hidden="true">
          {shapes.filter((st) => st.width > 34 || active === st.name).map((st) => (
            <text key={st.name} x={st.c.x} y={st.c.y} textAnchor="middle" className={active === st.name ? 'is-active' : ''}>{st.name.replace(/ \(.*\)/, '')}</text>
          ))}
        </g>

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
      </div>
      </div>
      <p className="rd-hint">Drag the map to tilt and turn it.</p>
      <ul className="rd-legend" aria-label="Legend">
        <li><i className="is-alert" /> Alert</li>
        <li><i className="is-watch" /> Watch</li>
        <li><i className="is-quiet" /> No cluster</li>
      </ul>
    </div>
  )
}
