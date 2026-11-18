import { useEffect, useState } from 'react'
import { CheckCircle2, Siren } from 'lucide-react'
import { Person } from '../pages/landing/People'
import './brandFilm.css'

const SCENE_MS = 4200

const CAPTIONS = [
  'A health worker meets a patient far from any hospital.',
  'Red flags are caught in a second, not an hour.',
  'A verified doctor joins a live case room.',
  'The answer is saved, so the next village is helped too.',
]

function Village() {
  return (
    <svg viewBox="0 0 480 300" className="bf-svg" aria-hidden="true">
      <defs>
        <linearGradient id="bf-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1456d6" /><stop offset="1" stopColor="#9fd0ff" /></linearGradient>
      </defs>
      <rect width="480" height="300" fill="url(#bf-sky)" />
      <circle cx="400" cy="70" r="26" fill="#fff3b8" className="bf-sun" />
      <path d="M0 200c80-40 150-30 240 0s170 20 240-14v114H0z" fill="#2fa57a" />
      <path d="M0 240c120-30 240-20 480 4v56H0z" fill="#52c08e" />
      {/* hut */}
      <rect x="40" y="150" width="120" height="70" fill="#f4e3c8" /><path d="M28 152L100 96l72 56z" fill="#c8553d" /><rect x="88" y="178" width="26" height="42" rx="3" fill="#8a5a3c" />
      {/* patient on a cot */}
      <g transform="translate(250 190)">
        <rect x="0" y="34" width="110" height="10" rx="4" fill="#8a5a3c" /><rect x="6" y="44" width="6" height="22" fill="#6b4a2f" /><rect x="98" y="44" width="6" height="22" fill="#6b4a2f" />
        <path d="M10 34c0-22 12-30 30-30s30 8 30 30z" fill="#7aa6e8" />
        <circle cx="30" cy="-6" r="13" fill="#a8714b" /><path d="M17 -8c0-9 6-13 13-13s13 4 13 13c-4-4-8-6-13-6s-9 2-13 6z" fill="#e8e8ee" />
        <path d="M44 6c8 0 14 6 18 14" stroke="#a8714b" strokeWidth="6" strokeLinecap="round" fill="none" />
      </g>
      {/* ASHA worker */}
      <g transform="translate(205 160)"><g className="bf-breathe">
        <path d="M0 88V40c0-14 9-20 17-20s17 6 17 20v48z" fill="#e4572e" /><path d="M17 22c9 8 17 18 20 36l-12 6z" fill="#f3b33d" />
        <circle cx="17" cy="8" r="12" fill="#b9794f" /><path d="M5 6c0-11 7-14 12-14s12 3 12 14c-4-5-7-7-12-7s-8 2-12 7z" fill="#1a1210" /><circle cx="17" cy="1" r="1.5" fill="#c2185b" />
        <rect x="30" y="38" width="12" height="20" rx="3" fill="#122a5c" /><rect x="32" y="41" width="8" height="12" rx="1.5" fill="#7fd1ff" className="bf-blink" />
      </g></g>
      <ellipse cx="226" cy="252" rx="26" ry="5" fill="#0a3a2a" opacity=".25" />
    </svg>
  )
}

function Alert() {
  return (
    <div className="bf-center bf-alertscene">
      <div className="bf-phone">
        <div className="bf-phone-bar"><span /> New case</div>
        <p className="bf-line">Man, 58 · chest pain 30 min</p>
        <p className="bf-line bf-dim">SpO₂ 88 · sweating</p>
        <div className="bf-redcard"><Siren size={18} /><div><strong>RED · Urgent</strong><small>Possible cardiac event. Arrange transport now.</small></div></div>
      </div>
      <i className="bf-ring bf-ring1" /><i className="bf-ring bf-ring2" />
    </div>
  )
}

function Doctor() {
  return (
    <div className="bf-duo">
      <div className="bf-tile bf-tile-l"><Person look="doctorF" size={150} /><span><i className="bf-dot" /> Dr. Meera · live</span></div>
      <div className="bf-bubbles">
        <p className="bf-b bf-b1">Give aspirin 300 mg if no allergy.</p>
        <p className="bf-b bf-b2 is-me">No allergy. Ambulance in 20 min.</p>
        <p className="bf-b bf-b3">Good. Keep him seated and calm.</p>
      </div>
      <div className="bf-tile bf-tile-r"><Person look="asha" size={150} /><span>Kavitha · ASHA</span></div>
    </div>
  )
}

function Saved() {
  return (
    <div className="bf-center bf-saved">
      <div className="bf-card">
        <div className="bf-card-h"><CheckCircle2 size={20} /> Verified answer saved</div>
        <p>Chest pain with low SpO₂: seat the patient, aspirin if no allergy, urgent transport.</p>
        <div className="bf-tags"><span>Cardiology</span><span>RED</span><span>Helpful · 12</span></div>
      </div>
      <div className="bf-follow"><i /> Follow-up check in 24 h</div>
    </div>
  )
}

export function BrandFilm() {
  const [i, setI] = useState(0)
  const [hasVideo, setHasVideo] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % CAPTIONS.length), SCENE_MS)
    return () => clearInterval(t)
  }, [])

  const scenes = [<Village key="a" />, <Alert key="b" />, <Doctor key="c" />, <Saved key="d" />]
  return (
    <figure className="bf" aria-label="Short film: a health worker, a doctor and a patient">
      <div className="bf-stage">
        {scenes.map((s, k) => <div key={k} className={`bf-scene ${k === i ? 'is-on' : ''}`} aria-hidden={k !== i}>{s}</div>)}
        {/* Optional real video: drop a file at public/media/brand.mp4. If it is missing or cannot play, the film above stays. */}
        <video className={`bf-video ${hasVideo ? 'is-on' : ''}`} src="/media/brand.mp4" autoPlay muted loop playsInline
          onCanPlay={() => setHasVideo(true)} onError={() => setHasVideo(false)} />
        <span className="bf-live"><i /> Preview</span>
      </div>
      <figcaption>
        <span key={i} className="bf-cap">{CAPTIONS[i]}</span>
        <span className="bf-dots" aria-hidden="true">{CAPTIONS.map((_, k) => <i key={k} className={k === i ? 'is-on' : k < i ? 'is-done' : ''} style={k === i ? { animationDuration: `${SCENE_MS}ms` } : undefined} />)}</span>
      </figcaption>
    </figure>
  )
}
