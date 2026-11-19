import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { JUST_REGISTERED_KEY, START_TOUR_EVENT, STEPS, roleOf, tourKey } from './steps'
import './tour.css'

type Box = { top: number; left: number; width: number; height: number }
const PAD = 6

function read(id: string): boolean { try { return localStorage.getItem(tourKey(id)) === '1' } catch { return false } }
function mark(id: string) { try { localStorage.setItem(tourKey(id), '1') } catch { /* ignore */ } }

/** First-run guided tour. Spotlights real controls; falls back to a centred card when a target is missing. */
export function Tour() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  const steps = STEPS[roleOf(user)]
  const step = steps[i]

  // Auto-start only for a brand-new account, right after sign-up — never on an ordinary
  // sign-in. The flag is set by AuthContext.signUp and consumed here, so it fires once.
  useEffect(() => {
    if (!user || user.status !== 'ACTIVE' || read(user.id)) return
    let justRegistered = false
    try { justRegistered = sessionStorage.getItem(JUST_REGISTERED_KEY) === '1' } catch { /* ignore */ }
    if (!justRegistered) return
    try { sessionStorage.removeItem(JUST_REGISTERED_KEY) } catch { /* ignore */ }
    const t = setTimeout(() => { setI(0); setOpen(true) }, 900)
    return () => clearTimeout(t)
  }, [user])

  // Replay from the help button.
  useEffect(() => {
    const on = () => { setI(0); setOpen(true) }
    window.addEventListener(START_TOUR_EVENT, on)
    return () => window.removeEventListener(START_TOUR_EVENT, on)
  }, [])

  const close = useCallback(() => { if (user) mark(user.id); setOpen(false) }, [user])

  const measure = useCallback(() => {
    const el = step?.target ? document.querySelector<HTMLElement>(step.target) : null
    if (!el) { setBox(null); return }
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) { setBox(null); return }
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
  }, [step])

  useLayoutEffect(() => { if (open) measure() }, [open, i, measure])
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', measure)
    const t = setInterval(measure, 500)   // layout can shift as pages load
    return () => { window.removeEventListener('resize', measure); clearInterval(t) }
  }, [open, measure])

  useEffect(() => { if (open) nextRef.current?.focus() }, [open, i])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1))
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, steps.length])

  if (!open || !step) return null
  const last = i === steps.length - 1

  // Place the card to the right of the spotlight (the rail is on the left), else centred.
  const style: React.CSSProperties = box
    ? box.left < 140
      ? { top: Math.min(Math.max(16, box.top), window.innerHeight - 280), left: box.left + box.width + 18 }
      : { top: Math.max(16, box.top - 250), left: Math.max(16, Math.min(box.left, window.innerWidth - 380)) }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <div className="mc-tour" role="presentation">
      <div className="mc-tour-block" onClick={close} />
      {box && <div className="mc-tour-spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />}
      {!box && <div className="mc-tour-dim" />}
      <div className="mc-tour-card" style={style} role="dialog" aria-modal="true" aria-labelledby="mc-tour-title" key={i}>
        <button type="button" className="mc-tour-x" onClick={close} aria-label="Skip tour"><X size={15} /></button>
        <small className="mc-tour-count">Step {i + 1} of {steps.length}</small>
        <h3 id="mc-tour-title">{step.title}</h3>
        <p>{step.body}</p>
        {step.legend === 'urgency' && (
          <ul className="mc-tour-legend">
            <li><i className="is-red" /><b>RED</b> Urgent. Doctor is alerted at once.</li>
            <li><i className="is-amber" /><b>AMBER</b> Soon. Needs a doctor within the hour.</li>
            <li><i className="is-green" /><b>GREEN</b> Routine advice.</li>
          </ul>
        )}
        <div className="mc-tour-bar" aria-hidden="true"><span style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
        <div className="mc-tour-btns">
          <button type="button" className="mc-tour-skip" onClick={close}>{last ? 'Close' : 'Skip tour'}</button>
          <span>
            {i > 0 && <button type="button" className="mc-tour-btn" onClick={() => setI(i - 1)}><ArrowLeft size={14} /> Back</button>}
            <button type="button" ref={nextRef} className="mc-tour-btn is-primary" onClick={() => (last ? close() : setI(i + 1))}>
              {last ? 'Finish' : 'Next'} {!last && <ArrowRight size={14} />}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
