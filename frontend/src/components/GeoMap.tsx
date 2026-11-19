import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface GeoMarker {
  id: string
  lat: number
  lng: number
  html: string          // inner HTML of the pin
  size?: number
  label: string         // hover text and accessible name
  focus?: boolean       // zoom here when picked
}

interface Props {
  markers: GeoMarker[]
  selectedId?: string | null
  onPick?: (id: string) => void
  ariaLabel: string
  className?: string
}

/** Clean street map (light or dark with the app theme) with labelled place names and HTML pins. */
export function GeoMap({ markers, selectedId, onPick, ariaLabel, className }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const pick = useRef(onPick)
  pick.current = onPick
  const fitted = useRef(false)

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { minZoom: 4, maxZoom: 15, zoomControl: true, maxBounds: [[-5, 55], [42, 110]] }).setView([22, 80], 5)
    // A full street map with state borders, roads and place names, in light colours in both themes so it always reads clearly.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri, HERE, Garmin, OpenStreetMap contributors', maxNativeZoom: 15, maxZoom: 15,
    }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => { m.remove(); map.current = null; layer.current = null; fitted.current = false }
  }, [])

  useEffect(() => {
    const m = map.current, g = layer.current
    if (!m || !g) return
    g.clearLayers()
    for (const k of markers) {
      const s = k.size ?? 34
      const icon = L.divIcon({ className: 'geo-pin-wrap', html: k.html, iconSize: [s, s], iconAnchor: [s / 2, s / 2] })
      const mk = L.marker([k.lat, k.lng], { icon, title: k.label, keyboard: true, riseOnHover: true }).addTo(g)
      mk.bindTooltip(k.label, { direction: 'top', offset: [0, -s / 2] })
      mk.on('click', () => { pick.current?.(k.id); if (k.focus !== false) m.flyTo([k.lat, k.lng], Math.max(m.getZoom(), 8), { duration: 0.6 }) })
    }
    if (!fitted.current && markers.length) {
      fitted.current = true
      if (markers.length > 1) m.fitBounds(L.latLngBounds(markers.map((k) => [k.lat, k.lng] as [number, number])), { padding: [60, 60], maxZoom: 8 })
      else m.setView([markers[0].lat, markers[0].lng], 8)
    }
  }, [markers])

  useEffect(() => {
    const k = markers.find((x) => x.id === selectedId)
    if (k && map.current) map.current.panTo([k.lat, k.lng], { animate: true })
  }, [selectedId, markers])

  return <div className={`geo-map ${className ?? ''}`} ref={el} role="application" aria-label={ariaLabel} />
}
