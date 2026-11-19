import { useEffect, useRef, useState } from 'react'
import { Activity, CheckCircle2, Siren, Stethoscope } from 'lucide-react'
import './brandFilm.css'

const PHASE_MS = 4500

const CAPTIONS = [
  'Health workers in remote villages meet patients far from any hospital.',
  'A case is sent by voice. Red flags are caught in a second.',
  'A verified doctor accepts it and answers in a live room.',
  'The answer is saved, so the next village is helped too.',
]

/** Coarse outline of India as [lon, lat]. Used only to draw a dotted map. */
const OUTLINE: [number, number][] = [
  [74.3, 34.5], [77.8, 35.5], [79, 32], [81, 30.2], [84, 28.5], [88, 27.2], [88.5, 26.6], [92, 27.8], [96, 28.3], [97, 27], [95, 25],
  [93.5, 22], [92.2, 23.5], [91.3, 22.5], [89, 22], [87, 21.5], [85, 19.5], [82, 16.5], [80.3, 15.5], [80.3, 13], [79.8, 10.3], [78.2, 8.1],
  [77.5, 8.1], [76.3, 9.5], [75.3, 12], [74.4, 14.8], [73.5, 17], [72.8, 19.3], [72.8, 21], [70.5, 20.8], [69, 22.3], [70.2, 22.9],
  [68.2, 23.7], [70, 25.5], [71, 27.5], [73.5, 29.5], [74.5, 31.5],
]
const LON0 = 68, LON1 = 97.5, LAT0 = 8, LAT1 = 35.8
const KX = Math.cos((22 * Math.PI) / 180)

type Place = { name: string; lon: number; lat: number }
const VILLAGES: Place[] = [
  { name: 'Wayanad', lon: 76.1, lat: 11.7 }, { name: 'Pudukkottai', lon: 78.8, lat: 10.4 }, { name: 'Barmer', lon: 71.4, lat: 25.7 },
  { name: 'Gadchiroli', lon: 80.2, lat: 20.2 }, { name: 'Koraput', lon: 82.7, lat: 18.8 }, { name: 'Dhemaji', lon: 94.6, lat: 27.5 },
  { name: 'Pithoragarh', lon: 80.2, lat: 29.6 }, { name: 'Kutch', lon: 69.8, lat: 23.7 }, { name: 'Malda', lon: 88.1, lat: 25.0 },
]
const HUBS: Place[] = [
  { name: 'Delhi', lon: 77.2, lat: 28.6 }, { name: 'Mumbai', lon: 72.9, lat: 19.1 }, { name: 'Chennai', lon: 80.3, lat: 13.1 }, { name: 'Kolkata', lon: 88.4, lat: 22.6 },
]

function inside(lon: number, lat: number) {
  let c = false
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, yi] = OUTLINE[i], [xj, yj] = OUTLINE[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

type Arc = { a: number; h: number; t0: number; dur: number; hero: boolean }

function MapCanvas({ phaseRef }: { phaseRef: React.MutableRefObject<number> }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let W = 0, H = 0, raf = 0
    let dots: { x: number; y: number }[] = []
    let proj: (p: Place) => { x: number; y: number } = () => ({ x: 0, y: 0 })
    const arcs: Arc[] = []
    const ripples: { x: number; y: number; t0: number }[] = []
    let lastAmbient = 0, lastHero = -1

    const layout = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      W = r.width; H = r.height
      canvas.width = W * dpr; canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const spanX = (LON1 - LON0) * KX, spanY = LAT1 - LAT0
      const scale = Math.min((W * 1.02) / spanX, (H * 0.66) / spanY)
      const ox = W / 2 - (spanX * scale) / 2 + W * 0.04
      const oy = H - spanY * scale - H * 0.14
      proj = (p) => ({ x: ox + (p.lon - LON0) * KX * scale, y: oy + (LAT1 - p.lat) * scale })
      dots = []
      const step = Math.max(8, Math.round(scale * 0.42))
      for (let y = oy; y < oy + spanY * scale; y += step) {
        for (let x = ox; x < ox + spanX * scale; x += step) {
          const lon = LON0 + (x - ox) / (KX * scale), lat = LAT1 - (y - oy) / scale
          if (inside(lon, lat)) dots.push({ x, y })
        }
      }
    }

    const nearestHub = (i: number) => {
      const v = VILLAGES[i]; let best = 0, bd = 1e9
      HUBS.forEach((h, k) => { const d = (h.lon - v.lon) ** 2 + (h.lat - v.lat) ** 2; if (d < bd) { bd = d; best = k } })
      return best
    }

    const frame = (now: number) => {
      const t = now / 1000
      ctx.clearRect(0, 0, W, H)

      // dotted map with a slow light sweep
      for (const d of dots) {
        const wave = 0.5 + 0.5 * Math.sin(t * 1.1 - (d.x + d.y) * 0.012)
        ctx.fillStyle = `rgba(120, 180, 255, ${0.24 + wave * 0.5})`
        ctx.beginPath(); ctx.arc(d.x, d.y, 1.9, 0, 6.283); ctx.fill()
      }

      const vp = VILLAGES.map(proj), hp = HUBS.map(proj)

      // arcs: ambient traffic, plus a hero arc when phase 1 begins
      const phase = phaseRef.current
      if (t - lastAmbient > 1.1) {
        lastAmbient = t
        const a = Math.floor(Math.random() * VILLAGES.length)
        arcs.push({ a, h: nearestHub(a), t0: t, dur: 2.4, hero: false })
      }
      if (phase === 1 && lastHero !== 1) { lastHero = 1; arcs.push({ a: 2, h: 0, t0: t, dur: 2.8, hero: true }) }
      if (phase !== 1) lastHero = phase

      // hubs
      hp.forEach((p, k) => {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 34)
        g.addColorStop(0, 'rgba(79, 140, 255, .55)'); g.addColorStop(1, 'rgba(79, 140, 255, 0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, 6.283); ctx.fill()
        ctx.fillStyle = '#cfe3ff'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 6.283); ctx.fill()
        ctx.strokeStyle = 'rgba(207, 227, 255, .9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, 6.283); ctx.stroke()
        if (k === 0 || k === 2) { ctx.fillStyle = 'rgba(207,227,255,.8)'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText(HUBS[k].name, p.x + 12, p.y + 4) }
      })

      // villages: pulsing beacons
      vp.forEach((p, i) => {
        const hero = i === 2 && phase >= 1
        const col = hero ? '255, 93, 108' : i % 3 === 0 ? '232, 163, 61' : '52, 195, 143'
        const k = (t * 0.7 + i * 0.37) % 1
        ctx.strokeStyle = `rgba(${col}, ${(1 - k) * 0.8})`; ctx.lineWidth = 1.6
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 + k * (hero ? 26 : 16), 0, 6.283); ctx.stroke()
        ctx.fillStyle = `rgb(${col})`; ctx.shadowColor = `rgb(${col})`; ctx.shadowBlur = 10
        ctx.beginPath(); ctx.arc(p.x, p.y, hero ? 5 : 3.4, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0
      })

      // arcs with a travelling comet
      for (let n = arcs.length - 1; n >= 0; n--) {
        const A = arcs[n], p = (t - A.t0) / A.dur
        if (p > 1.25) { arcs.splice(n, 1); continue }
        const s = vp[A.a], e = hp[A.h]
        const cx = (s.x + e.x) / 2, cy = Math.min(s.y, e.y) - Math.hypot(e.x - s.x, e.y - s.y) * 0.32
        const at = (u: number) => ({ x: (1 - u) * (1 - u) * s.x + 2 * (1 - u) * u * cx + u * u * e.x, y: (1 - u) * (1 - u) * s.y + 2 * (1 - u) * u * cy + u * u * e.y })
        const head = Math.min(1, p), tail = Math.max(0, head - 0.3)
        ctx.lineCap = 'round'
        for (let u = tail; u < head; u += 0.02) {
          const a = at(u), b = at(Math.min(1, u + 0.02)), f = (u - tail) / (head - tail || 1)
          ctx.strokeStyle = A.hero ? `rgba(255, 140, 150, ${f})` : `rgba(127, 209, 255, ${f * 0.85})`
          ctx.lineWidth = (A.hero ? 3 : 1.8) * (0.4 + f); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        }
        if (p <= 1) { const h = at(head); ctx.fillStyle = '#fff'; ctx.shadowColor = A.hero ? '#ff5d6c' : '#7fd1ff'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(h.x, h.y, A.hero ? 4 : 2.6, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0 }
        if (p > 1 && p < 1.02) ripples.push({ x: e.x, y: e.y, t0: t })
      }
      for (let n = ripples.length - 1; n >= 0; n--) {
        const r = ripples[n], k = (t - r.t0) / 1.2
        if (k > 1) { ripples.splice(n, 1); continue }
        ctx.strokeStyle = `rgba(160, 205, 255, ${1 - k})`; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(r.x, r.y, 8 + k * 44, 0, 6.283); ctx.stroke()
      }
      if (!reduce) raf = requestAnimationFrame(frame)
    }

    layout()
    const ro = new ResizeObserver(layout); ro.observe(canvas)
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [phaseRef])
  return <canvas ref={ref} className="bf-canvas" aria-hidden="true" />
}

function useTicker(to: number, on: boolean) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!on) { setN(0); return }
    let raf = 0; const t0 = performance.now()
    const tick = (t: number) => { const p = Math.min(1, (t - t0) / 2400); setN(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, on])
  return n
}

export function BrandFilm() {
  const [i, setI] = useState(0)
  const [hasVideo, setHasVideo] = useState(false)
  const phaseRef = useRef(0)
  const vref = useRef<HTMLVideoElement>(null)
  useEffect(() => { phaseRef.current = i }, [i])
  const [phaseMs, setPhaseMs] = useState(PHASE_MS)
  // Without a video the animation runs on a timer. With a video, captions follow its playback.
  useEffect(() => {
    if (hasVideo) return
    const t = setInterval(() => setI((n) => (n + 1) % CAPTIONS.length), PHASE_MS)
    return () => clearInterval(t)
  }, [hasVideo])
  const followVideo = () => {
    const v = vref.current
    if (v && v.duration) setI(Math.min(CAPTIONS.length - 1, Math.floor((v.currentTime / v.duration) * CAPTIONS.length)))
  }
  const cases = useTicker(1284, i === 3), mins = useTicker(4, i === 3)

  return (
    <figure className={`bf ${hasVideo ? 'has-video' : ''}`} aria-label="Short film: villages connected to verified doctors across India">
      <div className="bf-stage">
        <div className="bf-glow" aria-hidden="true" />
        <MapCanvas phaseRef={phaseRef} />

        <div className="bf-cards" aria-hidden="true">
          <div key={`c${i}`} className="bf-glass">
            {i === 0 && <><span className="bf-ic is-amber"><Activity size={16} /></span><div><strong>Wayanad · ASHA Kavitha</strong><small>Child, 3 yrs · fever 3 days</small></div><em className="bf-tag is-amber">AMBER</em></>}
            {i === 1 && <><span className="bf-ic is-red"><Siren size={16} /></span><div><strong>Barmer · chest pain, SpO₂ 88</strong><small>Possible cardiac event. Transport advised.</small></div><em className="bf-tag is-red">RED</em></>}
            {i === 2 && <><span className="bf-ic is-blue"><Stethoscope size={16} /></span><div><strong>Dr. Meera accepted in 38 s</strong><small>“Aspirin 300 mg if no allergy. Keep him seated.”</small></div><em className="bf-tag is-blue">LIVE</em></>}
            {i === 3 && <><span className="bf-ic is-green"><CheckCircle2 size={16} /></span><div><strong>Verified answer saved</strong><small>Searchable by every health worker</small></div><em className="bf-tag is-green">SAVED</em></>}
          </div>
          <div className={`bf-stats ${i === 3 ? 'is-on' : ''}`}>
            <div><strong>{cases.toLocaleString()}</strong><span>cases answered</span></div>
            <div><strong>{mins} min</strong><span>avg. time to a doctor</span></div>
          </div>
        </div>

        {/* Optional real video: drop a file at public/media/brand.mp4. It plays over the film when present. */}
        <video ref={vref} className={`bf-video ${hasVideo ? 'is-on' : ''}`} src="/media/brand.mp4" autoPlay muted loop playsInline
          onCanPlay={(e) => { setHasVideo(true); setPhaseMs((e.currentTarget.duration / CAPTIONS.length) * 1000) }}
          onTimeUpdate={followVideo} onError={() => setHasVideo(false)} />
        <span className="bf-live">Illustrative · demo data</span>
        <div className="bf-shade" aria-hidden="true" />
      </div>
      <figcaption>
        <span key={i} className="bf-cap">{CAPTIONS[i]}</span>
        <span className="bf-dots" aria-hidden="true">{CAPTIONS.map((_, k) => <i key={k} className={k === i ? 'is-on' : k < i ? 'is-done' : ''} style={k === i ? { animationDuration: `${phaseMs}ms` } : undefined} />)}</span>
      </figcaption>
    </figure>
  )
}
