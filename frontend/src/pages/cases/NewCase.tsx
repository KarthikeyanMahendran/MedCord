import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Baby, Bone, Droplets, Eye, HeartPulse, Mic, Square, Thermometer, TriangleAlert, Wind, Zap } from 'lucide-react'
import { Alert, Button, Card, FormGroup, Input, PageHeader, Textarea } from '../../components/ui'
import { UrgencyBadge } from '../../components/cases/UrgencyBadge'
import { submitCase } from '../../api/cases'
import type { SubmitCase, SubmitResult } from '../../api/cases'
import { problemMessage } from '../../api/client'
import { enqueue, isOffline } from '../../lib/offlineQueue'
import { LANGUAGES, canDictate, dictate } from '../../lib/speech'

/** Big tap targets for people who can't easily type. The English tag is appended so triage works in any language. */
const SYMPTOMS = [
  { tag: 'chest pain', label: 'Chest pain', Icon: HeartPulse },
  { tag: 'cannot breathe', label: 'Breathing trouble', Icon: Wind },
  { tag: 'heavy bleeding', label: 'Heavy bleeding', Icon: Droplets },
  { tag: 'seizure', label: 'Fits / seizure', Icon: Zap },
  { tag: 'fever', label: 'Fever', Icon: Thermometer },
  { tag: 'child unwell', label: 'Child unwell', Icon: Baby },
  { tag: 'fracture injury', label: 'Injury / bone', Icon: Bone },
  { tag: 'eye problem', label: 'Eye problem', Icon: Eye },
] as const

const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Number(s))

export default function NewCase() {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('mc_lang') ?? 'en-IN' } catch { return 'en-IN' } })
  const [complaint, setComplaint] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('')
  const [village, setVillage] = useState('')
  const [v, setV] = useState({ temperature: '', spo2: '', heartRate: '', systolic: '' })
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queued, setQueued] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => () => stopRef.current?.(), [])
  useEffect(() => { try { localStorage.setItem('mc_lang', lang) } catch { /* ignore */ } }, [lang])

  function toggleMic() {
    if (listening) { stopRef.current?.(); return }
    const base = complaint ? complaint + ' ' : ''
    setListening(true); setError(null)
    stopRef.current = dictate(lang, (t) => setComplaint(base + t), (err) => { setListening(false); if (err) setError(err) })
  }

  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const text = [complaint.trim(), ...tags].filter(Boolean).join('. ')
    if (!text) { setError('Describe the problem by voice, typing, or by tapping a symptom.'); return }
    const vitals: Record<string, number> = {}
    for (const [k, val] of Object.entries(v)) { const n = num(val); if (n !== undefined) vitals[k] = n }
    const payload: SubmitCase = {
      chiefComplaint: text, patientAge: num(age), patientSex: sex || undefined, village: village.trim() || undefined,
      language: lang.split('-')[0], vitals: Object.keys(vitals).length ? vitals : undefined,
    }
    setBusy(true); setError(null)
    try {
      setResult(await submitCase(payload))
    } catch (err) {
      if (isOffline(err)) { enqueue(payload); setQueued(true) } else setError(problemMessage(err))
    } finally { setBusy(false) }
  }

  if (queued) {
    return (
      <main className="mc-page">
        <PageHeader title="Saved on this device" description="You are offline." />
        <Alert tone="info">The case is saved and will be sent automatically as soon as the connection returns. Keep this page or the app open.</Alert>
        <div><Link to="/cases"><Button variant="secondary">Back to case rooms</Button></Link></div>
      </main>
    )
  }

  if (result) {
    const c = result.caseRoom
    return (
      <main className="mc-page">
        <PageHeader title="Case sent" description="A doctor is being notified now." actions={<UrgencyBadge urgency={c.urgency} />} />
        {c.redFlags.length > 0 && (
          <div className="mc-redflag" role="alert">
            <TriangleAlert size={20} />
            <div>
              <strong>{c.redFlags.map((f) => f.label).join(' · ')}</strong>
              <p>{c.redFlags[0].advice}</p>
              <p className="mc-redflag-note">This is an automatic alert, not a diagnosis.</p>
            </div>
          </div>
        )}
        <Card>
          <div className="mc-card-head"><h2>Case summary</h2><span className="mc-muted-sub">Goes to {c.specialtyNeeded}</span></div>
          <dl className="mc-dl" style={{ padding: 20, gridTemplateColumns: '120px 1fr' }}>
            <dt>Situation</dt><dd>{c.sbar?.situation}</dd>
            <dt>Background</dt><dd>{c.sbar?.background}</dd>
            <dt>Assessment</dt><dd>{c.sbar?.assessment}</dd>
            <dt>Recommendation</dt><dd>{c.sbar?.recommendation}</dd>
          </dl>
        </Card>
        {result.similarAnswers.length > 0 && (
          <Card>
            <div className="mc-card-head"><h2>Doctors have answered similar cases</h2></div>
            <div className="mc-list">
              {result.similarAnswers.map((h) => (
                <div key={h.id} className="mc-list-row" style={{ alignItems: 'flex-start' }}>
                  <span className="mc-list-main"><strong style={{ fontWeight: 500 }}>{h.questionSummary}</strong><span>{h.answer}</span></span>
                </div>
              ))}
            </div>
          </Card>
        )}
        <div className="mc-row" style={{ gap: 8 }}>
          <Link to={`/cases/${c.id}`}><Button>Open case room</Button></Link>
          <Link to="/cases"><Button variant="secondary">All cases</Button></Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mc-page">
      <PageHeader title="New case" description="Describe the patient. Speak, type, or tap. Use test data only." />
      <form onSubmit={onSubmit} className="mc-casform">
        {error && <Alert tone="danger">{error}</Alert>}

        <Card>
          <div className="mc-card-head"><h2>What is wrong?</h2>
            <select className="mc-select" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            <div className="mc-symptoms" role="group" aria-label="Quick symptoms">
              {SYMPTOMS.map(({ tag, label, Icon }) => (
                <button key={tag} type="button" className={`mc-symptom ${tags.includes(tag) ? 'is-on' : ''}`} aria-pressed={tags.includes(tag)} onClick={() => toggleTag(tag)}>
                  <Icon size={26} /><span>{label}</span>
                </button>
              ))}
            </div>
            <div className="mc-dictate">
              <Textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={4} aria-label="Describe the problem"
                placeholder="Describe the problem in your own words…" />
              {canDictate() && (
                <button type="button" className={`mc-mic ${listening ? 'is-live' : ''}`} onClick={toggleMic} aria-label={listening ? 'Stop recording' : 'Speak'}>
                  {listening ? <Square size={26} /> : <Mic size={26} />}
                  <span>{listening ? 'Listening… tap to stop' : 'Tap and speak'}</span>
                </button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="mc-card-head"><h2>Patient</h2></div>
          <div className="mc-grid-2" style={{ padding: 20 }}>
            <FormGroup id="age" label="Age"><Input id="age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} /></FormGroup>
            <FormGroup id="sex" label="Sex">
              <select id="sex" className="mc-select" value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="">Not stated</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
              </select>
            </FormGroup>
            <FormGroup id="village" label="Village / area"><Input id="village" value={village} onChange={(e) => setVillage(e.target.value)} /></FormGroup>
          </div>
        </Card>

        <Card>
          <div className="mc-card-head"><h2>Vitals (if you have them)</h2></div>
          <div className="mc-grid-2" style={{ padding: 20 }}>
            <FormGroup id="temp" label="Temperature (°C)"><Input id="temp" inputMode="decimal" value={v.temperature} onChange={(e) => setV({ ...v, temperature: e.target.value })} /></FormGroup>
            <FormGroup id="spo2" label="Oxygen SpO₂ (%)"><Input id="spo2" inputMode="numeric" value={v.spo2} onChange={(e) => setV({ ...v, spo2: e.target.value })} /></FormGroup>
            <FormGroup id="hr" label="Pulse (per min)"><Input id="hr" inputMode="numeric" value={v.heartRate} onChange={(e) => setV({ ...v, heartRate: e.target.value })} /></FormGroup>
            <FormGroup id="sys" label="Systolic BP"><Input id="sys" inputMode="numeric" value={v.systolic} onChange={(e) => setV({ ...v, systolic: e.target.value })} /></FormGroup>
          </div>
        </Card>

        <div className="mc-row" style={{ gap: 8 }}>
          <Button type="submit" loading={busy}>Send to a doctor</Button>
          <Link to="/cases"><Button variant="secondary">Cancel</Button></Link>
        </div>
      </form>
    </main>
  )
}
