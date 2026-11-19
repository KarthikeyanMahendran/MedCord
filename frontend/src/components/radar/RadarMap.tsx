import { useMemo } from 'react'
import { GeoMap } from '../GeoMap'
import type { GeoMarker } from '../GeoMap'
import { isLive } from '../../api/outbreaks'
import type { OutbreakAlert, RegionPoint } from '../../api/outbreaks'

interface Props {
  regions: RegionPoint[]
  alerts: OutbreakAlert[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/** Real map. Live alerts pulse (red = ALERT, amber = WATCH); watched areas with no cluster are small blue dots. */
export function RadarMap({ regions, alerts, selectedId, onSelect }: Props) {
  const markers = useMemo<GeoMarker[]>(() => {
    const live = alerts.filter(isLive).filter((a) => a.lat != null && a.lng != null)
    const inAlert = new Set(live.map((a) => a.regionId))
    const quiet: GeoMarker[] = regions.filter((r) => r.lat != null && r.lng != null && !inAlert.has(r.id)).map((r) => ({
      id: `region:${r.id}`, lat: r.lat!, lng: r.lng!, size: 16, focus: false,
      label: `${r.name}, ${r.district}: ${r.cases72h} case${r.cases72h === 1 ? '' : 's'} in 72 h. No cluster.`,
      html: `<div class="geo-dot ${r.cases72h > 0 ? 'has-cases' : ''}"></div>`,
    }))
    const hot: GeoMarker[] = live.map((a, i) => {
      const sameArea = live.filter((x) => x.regionId === a.regionId)
      const off = sameArea.length > 1 ? (sameArea.indexOf(a) - (sameArea.length - 1) / 2) * 0.12 : 0
      return {
        id: a.id, lat: a.lat! + (i % 2 ? off : 0), lng: a.lng! + off, size: 42,
        label: `${a.severity === 'ALERT' ? 'Alert' : 'Watch'}: ${a.syndromeLabel}, ${a.regionName} (${a.caseCount} cases)`,
        html: `<div class="geo-alert ${a.severity === 'ALERT' ? 'is-alert' : 'is-watch'} ${selectedId === a.id ? 'is-selected' : ''}"><b>${a.caseCount}</b></div>`,
      }
    })
    return [...quiet, ...hot]
  }, [regions, alerts, selectedId])

  return (
    <div className="rd-map">
      <GeoMap markers={markers} selectedId={selectedId} onPick={(id) => { if (!id.startsWith('region:')) onSelect(id) }} ariaLabel="Map of monitored areas and outbreak alerts. Choose a marker to open an alert." className="rd-geo" />
      <ul className="rd-legend" aria-label="Legend">
        <li><i className="is-alert" /> Alert</li>
        <li><i className="is-watch" /> Watch</li>
        <li><i className="is-quiet" /> No cluster</li>
      </ul>
    </div>
  )
}
