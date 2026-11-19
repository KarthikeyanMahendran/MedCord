import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, ArrowRight, BellRing, BookOpenCheck, CheckCircle2, Mic, Phone, ShieldCheck, Siren,
  Stethoscope, Wifi, WifiOff, Zap,
} from 'lucide-react'
import { Person } from './People'
import { VillageScene } from './Scenes'
import { useCount, useReveal } from './useReveal'
import './landing.css'

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, seen] = useReveal<HTMLDivElement>()
  return <div ref={ref} className={`lp-reveal ${seen ? 'is-in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>
}

function Stat({ to, suffix = '', label }: { to: number; suffix?: string; label: string }) {
  const [ref, seen] = useReveal<HTMLDivElement>(0.4)
  const n = useCount(to, seen)
  return <div ref={ref} className="lp-stat"><strong>{n}{suffix}</strong><span>{label}</span></div>
}

const CHAT = [
  { who: 'ASHA · Kavitha', mine: true, text: 'Man, 58, chest pain for 30 min, sweating. SpO₂ 88.' },
  { who: 'MedCord', sys: true, text: 'RED · Possible cardiac event. Keep patient seated, arrange transport now.' },
  { who: 'Dr. Meera', text: 'Accepted. Give aspirin 300 mg if no allergy. Is there ECG access?' },
  { who: 'ASHA · Kavitha', mine: true, text: 'No ECG. Ambulance is 20 minutes away.' },
]

function CaseMock() {
  const [shown, setShown] = useState(1)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(CHAT.length); return }
    const t = setInterval(() => setShown((s) => (s >= CHAT.length ? 1 : s + 1)), 2200)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="lp-phone" aria-label="Example case room">
      <div className="lp-phone-top">
        <span className="lp-pill lp-pill-red"><Siren size={12} /> RED</span>
        <strong>Case · Chest pain</strong>
        <span className="lp-live"><i /> Live</span>
      </div>
      <div className="lp-phone-body">
        {CHAT.slice(0, shown).map((m, i) => (
          <div key={i} className={`lp-msg ${m.mine ? 'is-me' : ''} ${m.sys ? 'is-sys' : ''}`}>
            <small>{m.who}</small><p>{m.text}</p>
          </div>
        ))}
      </div>
      <div className="lp-phone-foot"><Mic size={16} /><span>Tap and speak…</span></div>
    </div>
  )
}

const STEPS = [
  { icon: Mic, title: 'Speak or tap', text: 'A health worker describes the patient by voice, in their own language, or taps a symptom. Works offline.' },
  { icon: Siren, title: 'Instant triage', text: 'Red-flag rules and vital-sign thresholds rate the case GREEN, AMBER or RED and write a clear SBAR summary.' },
  { icon: Stethoscope, title: 'A doctor picks it up', text: 'The right verified specialist is notified and joins a private case room. Unanswered urgent cases escalate on a timer.' },
  { icon: BookOpenCheck, title: 'Answer is kept', text: 'The verified answer joins a searchable library, so the next worker gets help in seconds. A 24-hour follow-up checks the patient.' },
]

const FEATURES = [
  { icon: Siren, title: 'Safety-first triage', text: 'Deterministic red-flag rules. No guesswork, no black box.' },
  { icon: BellRing, title: 'Smart escalation', text: 'RED after 5 min, AMBER after 15. Other doctors, then admins, are alerted.' },
  { icon: WifiOff, title: 'Built for weak networks', text: 'Cases are saved on the device and sent when the signal returns.' },
  { icon: Mic, title: 'Voice first', text: 'Dictate in Indian languages and hear replies read aloud.' },
  { icon: BookOpenCheck, title: 'Verified Answer Library', text: 'Every doctor answer becomes searchable knowledge for the next case.' },
  { icon: ShieldCheck, title: 'Verified doctors only', text: 'Admins check every doctor before they can answer.' },
]

export default function Landing() {
  const [scrolled, setScrolled] = useState(false)
  const [progress, setProgress] = useState(0)
  const [y, setY] = useState(0)
  const [sceneVideo, setSceneVideo] = useState(false)
  const [heroVideo, setHeroVideo] = useState(false)
  useEffect(() => {
    // The app shell locks page scroll; the landing page is a normal long page.
    const root = document.documentElement
    root.classList.add('lp-scroll')
    return () => root.classList.remove('lp-scroll')
  }, [])
  useEffect(() => {
    const on = () => {
      const h = document.documentElement
      setScrolled(h.scrollTop > 20); setY(h.scrollTop)
      setProgress(h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight))
    }
    on(); window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  return (
    <div className="lp">
      <div className="lp-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      <header className={`lp-nav ${scrolled ? 'is-solid' : ''}`}>
        <Link to="/welcome" className="lp-logo"><span><Activity size={18} /></span>MedCord <em>Case Rooms</em></Link>
        <nav aria-label="Sections">
          <a href="#how">How it works</a><a href="#features">Features</a><a href="#people">Who it is for</a><a href="#nexconn">Real-time</a>
        </nav>
        <div className="lp-nav-cta"><Link to="/login" className="lp-link">Sign in</Link><Link to="/register" className="lp-btn lp-btn-sm">Get started</Link></div>
      </header>

      <section className={`lp-hero ${heroVideo ? 'has-video' : ''}`}>
        <video className={`lp-hero-video ${heroVideo ? 'is-on' : ''}`} src="/media/brand3.mp4" autoPlay muted loop playsInline
          onCanPlay={() => setHeroVideo(true)} onError={() => setHeroVideo(false)} aria-hidden="true" />
        <div className="lp-hero-shade" aria-hidden="true" />
        <div className="lp-orb lp-orb-a" style={{ transform: `translateY(${y * 0.12}px)` }} />
        <div className="lp-orb lp-orb-b" style={{ transform: `translateY(${y * -0.08}px)` }} />
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-chip"><Zap size={14} /> Humanitarian &amp; social good</span>
            <h1>A doctor in every <span>village</span>, one tap away.</h1>
            <p>Rural Case Rooms connects community health workers with verified doctors. Send a case by voice, get triaged in a second, and have an answer in a private live room.</p>
            <div className="lp-hero-btns">
              <Link to="/register" className="lp-btn">Start a case room <ArrowRight size={16} /></Link>
              <a href="#how" className="lp-btn lp-btn-ghost">See how it works</a>
            </div>
            <ul className="lp-trust">
              <li><CheckCircle2 size={15} /> Verified doctors</li><li><CheckCircle2 size={15} /> Works offline</li><li><CheckCircle2 size={15} /> Demo data only</li>
            </ul>
          </div>
          <div className="lp-hero-art">
            <div className="lp-float lp-float-a"><Person look="doctorF" size={84} /><div><strong>Dr. Meera</strong><span>Cardiology · online</span></div></div>
            <CaseMock />
            <div className="lp-float lp-float-b"><Person look="asha" size={84} /><div><strong>Kavitha</strong><span>ASHA worker</span></div></div>
            <div className="lp-float lp-float-c"><Siren size={16} /> Doctor notified in 4 s</div>
          </div>
        </div>
      </section>

      <section className="lp-band">
        <div className="lp-wrap lp-band-in">
          <span>Built on the <strong>Nexconn Chat SDK</strong></span>
          <span>Spring Boot</span><span>PostgreSQL</span><span>React</span><span>Supabase</span>
        </div>
      </section>

      <section className="lp-sec lp-problem">
        <div className="lp-wrap">
          <Reveal><h2>Distance should not decide who gets care.</h2>
            <p className="lp-lead">Health workers often face urgent cases with no doctor nearby. Phone calls get lost, advice is never recorded, and the next worker starts from zero.</p></Reveal>
          <div className="lp-stats">
            <Reveal><Stat to={3} label="urgency levels, always visible" /></Reveal>
            <Reveal delay={80}><Stat to={5} suffix=" min" label="before a RED case escalates" /></Reveal>
            <Reveal delay={160}><Stat to={10} label="built-in red-flag rules" /></Reveal>
            <Reveal delay={240}><Stat to={24} suffix=" h" label="patient follow-up check" /></Reveal>
          </div>
        </div>
      </section>

      <section className="lp-scene" aria-label="From village to doctor">
        <VillageScene className="lp-scene-art" />
        <video className={`lp-scene-video ${sceneVideo ? 'is-on' : ''}`} src="/media/brand.mp4" autoPlay muted loop playsInline
          onCanPlay={() => setSceneVideo(true)} onError={() => setSceneVideo(false)} aria-hidden="true" />
        <div className="lp-scene-shade" aria-hidden="true" />
        <div className="lp-scene-cap lp-wrap">
          <Reveal><h2>The village sends the case. The doctor answers live.</h2>
            <p>No travel, no lost phone calls. Every case gets its own room, its own record, and a verified answer.</p></Reveal>
        </div>
      </section>

      <section id="how" className="lp-sec lp-how">
        <div className="lp-wrap">
          <Reveal><span className="lp-kicker">How it works</span><h2>From a village to a verified doctor in four steps.</h2></Reveal>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 100} className="lp-step">
                <span className="lp-step-n">{i + 1}</span>
                <span className="lp-step-i"><s.icon size={22} /></span>
                <h3>{s.title}</h3><p>{s.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="people" className="lp-sec lp-people">
        <div className="lp-wrap">
          <Reveal><span className="lp-kicker">Who it is for</span><h2>Made for the people on the ground.</h2></Reveal>
          <div className="lp-cards">
            {[
              { p: 'asha' as const, role: 'Community health worker', text: 'Describe the patient by voice, get triage advice at once, and never feel alone with a hard case.' },
              { p: 'doctorM' as const, role: 'Verified doctor', text: 'See a clean SBAR summary and a ranked queue. Answer once and help many workers.' },
              { p: 'admin' as const, role: 'Programme admin', text: 'Verify doctors, watch escalations, and see where help is reaching on the impact map.' },
            ].map((c, i) => (
              <Reveal key={c.role} delay={i * 120} className="lp-card">
                <Person look={c.p} size={132} className="lp-card-img" />
                <h3>{c.role}</h3><p>{c.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="lp-sec lp-feat">
        <div className="lp-wrap">
          <Reveal><span className="lp-kicker">Features</span><h2>Everything a case needs, nothing it does not.</h2></Reveal>
          <div className="lp-grid">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 90} className="lp-fcard">
                <span><f.icon size={20} /></span><h3>{f.title}</h3><p>{f.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="nexconn" className="lp-sec lp-nex">
        <div className="lp-wrap lp-nex-grid">
          <Reveal>
            <span className="lp-kicker lp-kicker-light">Powered by Nexconn</span>
            <h2>Real-time, wherever the signal reaches.</h2>
            <p className="lp-lead">Case messages and voice or video calls run on the Nexconn Chat SDK, so a doctor and a health worker stay connected the moment a case opens.</p>
            <ul className="lp-checks">
              <li><Wifi size={16} /> Live case-room messaging</li>
              <li><Phone size={16} /> One-tap voice and video calls</li>
              <li><ShieldCheck size={16} /> Private room per case</li>
            </ul>
          </Reveal>
          <Reveal delay={150}>
            <div className="lp-bars" aria-label="Example impact chart">
              {[34, 52, 41, 68, 59, 82, 74, 96].map((h, i) => <span key={i} style={{ ['--h' as string]: `${h}%`, transitionDelay: `${i * 70}ms` }} />)}
              <p>Cases answered per day · demo data</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lp-cta">
        <div className="lp-wrap">
          <Reveal><h2>Bring a doctor to every village.</h2>
            <p>Create an account and open your first case room in under a minute.</p>
            <div className="lp-hero-btns lp-center"><Link to="/register" className="lp-btn lp-btn-light">Get started <ArrowRight size={16} /></Link><Link to="/login" className="lp-btn lp-btn-ghost">Sign in</Link></div>
          </Reveal>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <span className="lp-logo"><span><Activity size={16} /></span>MedCord Case Rooms</span>
          <p>Demo project for the Nexconn Build Challenge 2026. Uses test data only. Not a medical device and not a diagnosis.</p>
        </div>
      </footer>
    </div>
  )
}
