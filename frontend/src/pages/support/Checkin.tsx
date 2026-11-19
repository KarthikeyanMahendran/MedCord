import { useCallback, useEffect, useState } from 'react'
import { Flame, Heart } from 'lucide-react'
import { Alert, Button, Card, EmptyState, FormGroup, PageHeader, SkeletonCard } from '../../components/ui'
import { ago } from '../../components/cases/UrgencyBadge'
import { VoiceInput } from '../../components/VoiceField'
import { checkIn, cheer, circle, myCheckins } from '../../api/support'
import type { CircleItem, MyCheckins } from '../../api/support'
import { fieldErrors, problemMessage } from '../../api/client'

const MOODS = [
  { v: 5, face: '😄', label: 'Great' }, { v: 4, face: '🙂', label: 'Good' }, { v: 3, face: '😐', label: 'Okay' },
  { v: 2, face: '😟', label: 'Worried' }, { v: 1, face: '😢', label: 'Struggling' },
]
const face = (v: number) => MOODS.find((m) => m.v === v)?.face ?? '🙂'
const word = (v: number) => MOODS.find((m) => m.v === v)?.label ?? ''

export default function CheckinPage() {
  const [mine, setMine] = useState<MyCheckins | null>(null)
  const [people, setPeople] = useState<CircleItem[] | null>(null)
  const [mood, setMood] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [shared, setShared] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [thanks, setThanks] = useState(false)

  const load = useCallback(async () => {
    try { const [m, c] = await Promise.all([myCheckins(), circle()]); setMine(m); setPeople(c); setErr(null) } catch (e) { setErr(problemMessage(e)) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function submit() {
    if (!mood) return
    setBusy(true); setErrors({}); setErr(null)
    try { setMine(await checkIn({ mood, note: note.trim() || undefined, shared })); setThanks(true); setNote(''); setPeople(await circle()) }
    catch (e) { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else setErr(problemMessage(e)) } finally { setBusy(false) }
  }

  async function sendKindWord(p: CircleItem) {
    setPeople((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, cheered: true, cheers: x.cheers + 1 } : x)))
    try { await cheer(p.id) } catch (e) { setErr(problemMessage(e)); void load() }
  }

  return (
    <div className="mc-page mc-page-wide">
      <PageHeader eyebrow="Peer support" title="How are you today?" description="A quick check-in. People in your communities can see it and send you a kind word. You are not alone." />
      {err && <Alert tone="danger">{err}</Alert>}

      <div className="ck-layout">
        <Card><div className="ck-box">
          {mine?.doneToday && !thanks && <p className="ck-done">You have already checked in today. You can check in again if things change.</p>}
          {thanks && <div className="fd-thanks" role="status"><Heart size={20} /><div><strong>Thank you for checking in</strong><span>{mood && mood <= 2 ? 'We are sorry it is hard right now. Someone in your communities may send you a kind word.' : 'Glad you shared. See you tomorrow.'}</span></div></div>}
          <div className="ck-moods" role="radiogroup" aria-label="How do you feel">
            {MOODS.map((m) => (
              <button key={m.v} type="button" role="radio" aria-checked={mood === m.v} className={mood === m.v ? 'is-on' : ''} onClick={() => { setMood(m.v); setThanks(false) }}>
                <span aria-hidden="true">{m.face}</span><small>{m.label}</small>
              </button>
            ))}
          </div>
          {errors.mood && <p className="mc-error">{errors.mood}</p>}
          <FormGroup id="cknote" label="Anything you would like to add? (optional)" error={errors.note}>
            <VoiceInput id="cknote" value={note} maxLength={200} onValue={setNote} placeholder="Long shift today, feeling tired" invalid={!!errors.note} />
          </FormGroup>
          <label className="fd-check"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Share with people in my communities</label>
          <Button full loading={busy} disabled={!mood} onClick={submit}>Check in</Button>
          {mine && mine.streak > 0 && <p className="ck-streak"><Flame size={15} /> {mine.streak} day{mine.streak === 1 ? '' : 's'} in a row</p>}
          {mine && mine.recent.length > 0 && (
            <div className="ck-recent" aria-label="Your recent check-ins">
              {mine.recent.slice(0, 7).reverse().map((c) => <span key={c.id} title={`${word(c.mood)} · ${ago(c.createdAt)}`}>{face(c.mood)}</span>)}
            </div>
          )}
        </div></Card>

        <div>
          <h2 className="ck-h">Your circle</h2>
          {people === null && !err && (
            <div className="mc-skel-grid" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          )}
          {people?.length === 0 && <EmptyState icon={<Heart size={22} />} title="No one has checked in lately">When people in your communities check in, you will see them here and can send a kind word.</EmptyState>}
          <ul className="ck-circle">
            {people?.map((p) => (
              <li key={p.id} className={p.needsKindWord ? 'needs' : ''}>
                <span className="ck-face" aria-hidden="true">{face(p.mood)}</span>
                <span className="ck-who"><strong>{p.name}</strong> feels {word(p.mood).toLowerCase()}{p.note && <em>“{p.note}”</em>}<small>{ago(p.createdAt)}{p.cheers > 0 ? ` · ${p.cheers} kind word${p.cheers === 1 ? '' : 's'}` : ''}</small></span>
                <Button variant={p.needsKindWord && !p.cheered ? 'primary' : 'secondary'} disabled={p.cheered} onClick={() => sendKindWord(p)}><Heart size={14} /> {p.cheered ? 'Sent' : 'Send a kind word'}</Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
