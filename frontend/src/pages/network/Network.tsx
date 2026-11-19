import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Stethoscope, Users } from 'lucide-react'
import { Alert, Badge, Card, EmptyState, PageHeader } from '../../components/ui'
import { ago } from '../../components/cases/UrgencyBadge'
import { getNetwork } from '../../api/network'
import type { Network, NetworkArea } from '../../api/network'
import { problemMessage } from '../../api/client'

const pinHtml = (a: NetworkArea, mine: boolean) => {
  const tone = a.liveAlerts > 0 ? 'is-alert' : a.cases72h > 0 ? 'is-watch' : 'is-quiet'
  return `<div class="nw-pin ${tone} ${mine ? 'is-mine' : ''}"><b>${a.people.length}</b></div>`
}

export default function NetworkPage() {
  const [data, setData] = useState<Network | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)

  useEffect(() => { getNetwork().then(setData).catch((e) => setErr(problemMessage(e))) }, [])

  useEffect(() => {
    if (!data || !el.current) return
    const dark = document.documentElement.dataset.theme !== 'light'
    const m = L.map(el.current, { minZoom: 4, maxZoom: 14 }).setView([21.5, 79], 5)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 14,
      className: dark ? 'nw-tiles-dark' : '',
    }).addTo(m)
    const pts: L.LatLngExpression[] = []
    for (const a of data.areas) {
      if (a.lat == null || a.lng == null) continue
      pts.push([a.lat, a.lng])
      const icon = L.divIcon({ className: 'nw-pin-wrap', html: pinHtml(a, a.id === data.myAreaId), iconSize: [34, 34], iconAnchor: [17, 17] })
      const mk = L.marker([a.lat, a.lng], { icon, title: `${a.name}, ${a.district}`, keyboard: true }).addTo(m)
      mk.bindTooltip(`${a.name} · ${a.district}`, { direction: 'top', offset: [0, -14] })
      mk.on('click', () => { setSel(a.id); m.flyTo([a.lat!, a.lng!], Math.max(m.getZoom(), 8), { duration: 0.7 }) })
    }
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 8 })
    else if (pts.length === 1) m.setView(pts[0], 9)
    map.current = m
    return () => { m.remove(); map.current = null }
  }, [data])

  const area = data?.areas.find((a) => a.id === sel) ?? null
  const people = data ? data.areas.reduce((n, a) => n + a.people.length, 0) : 0

  return (
    <div className="mc-page nw-page">
      <PageHeader eyebrow="Care network" title="Who is where"
        description={data?.scope === 'AREA' ? 'Your area and the colleagues working in it.' : 'Every area we cover, the health workers in it and the verified doctors on call.'} />
      {err && <Alert tone="danger">{err}</Alert>}
      {data && (
        <div className="nw-grid">
          <Card className="nw-mapcard">
            <div className="nw-map" ref={el} role="application" aria-label="Map of care areas. Choose a pin to see the people there." />
            <ul className="rd-legend" aria-label="Legend">
              <li><i className="is-alert" /> Live alert</li><li><i className="is-watch" /> Recent cases</li><li><i className="is-quiet" /> Quiet</li>
              <li>Number on a pin = health workers in the area</li>
            </ul>
          </Card>
          <div className="nw-side">
            <div className="rd-stats">
              <div className="mc-stat"><span>Areas</span><strong>{data.areas.length}</strong></div>
              <div className="mc-stat"><span>Health workers</span><strong>{people}</strong></div>
              {data.scope === 'ALL' && <div className="mc-stat"><span>Doctors</span><strong>{data.doctors.length}</strong></div>}
            </div>
            <Card>
              {!area ? <EmptyState title="Pick an area" description="Choose a pin on the map to see its health workers and recent cases." icon={<Users size={20} />} /> : (
                <div className="nw-detail">
                  <h3>{area.name}</h3>
                  <p className="nw-sub">{area.district}, {area.state} · {area.cases72h} case{area.cases72h === 1 ? '' : 's'} in 72 h{area.liveAlerts ? ` · ${area.liveAlerts} live alert${area.liveAlerts === 1 ? '' : 's'}` : ''}</p>
                  {area.id === data.myAreaId && <Badge tone="neutral">Your area</Badge>}
                  {area.people.length === 0 && <p className="nw-sub">No health worker has joined this area yet.</p>}
                  <ul className="nw-people">
                    {area.people.map((p) => (
                      <li key={p.id}>
                        <span className="nw-avatar" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
                        <span className="nw-who">
                          <strong>{p.name}</strong>
                          <span>{p.kind}{p.organisation ? ` · ${p.organisation}` : ''}</span>
                          <span>{p.languages.join(', ').toUpperCase()} · {p.cases72h} case{p.cases72h === 1 ? '' : 's'} in 72 h{p.lastCaseAt ? ` · last ${ago(p.lastCaseAt)}` : ' · no cases yet'}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
            {data.scope === 'ALL' && data.doctors.length > 0 && (
              <Card>
                <div className="nw-detail">
                  <h3><Stethoscope size={16} /> Verified doctors</h3>
                  <ul className="nw-people">
                    {data.doctors.map((d) => (
                      <li key={d.id}><span className="nw-avatar" aria-hidden="true">{d.name.slice(0, 1).toUpperCase()}</span>
                        <span className="nw-who"><strong>{d.name}</strong><span>{d.specialty}</span></span></li>
                    ))}
                  </ul>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
