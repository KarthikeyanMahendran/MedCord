import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, CheckCircle2, Copy, Heart, ShieldCheck } from 'lucide-react'
import { Alert, Badge, Button, Card, EmptyState, FormGroup, Input, PageLoader, Textarea } from '../../components/ui'
import { VoiceTextarea } from '../../components/VoiceField'
import { ProgressBar } from '../../components/fund/FundCardView'
import { ago } from '../../components/cases/UrgencyBadge'
import { closeFund, contribute, getFund, postFundUpdate, rejectFund, verifyFund } from '../../api/fundraisers'
import type { FundDetail } from '../../api/fundraisers'
import { fieldErrors, problemMessage } from '../../api/client'
import { NEED_ICON, NEED_LABEL, STATUS_LABEL, inr, percent, timeLeft } from '../../lib/fund'

const QUICK = [100, 250, 500, 1000]

export default function FundraiserDetail() {
  const { id = '' } = useParams()
  const [d, setD] = useState<FundDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [amount, setAmount] = useState<number | ''>(250)
  const [message, setMessage] = useState('')
  const [anon, setAnon] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [thanks, setThanks] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [upd, setUpd] = useState({ body: '', kind: 'UPDATE' as 'UPDATE' | 'FUNDS_USED' })

  const load = useCallback(async () => { try { setD(await getFund(id)); setErr(null) } catch (e) { setErr(problemMessage(e)) } }, [id])
  useEffect(() => { void load() }, [load])

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true); setErrors({}); setErr(null)
    try { await fn(); after?.() } catch (e) { const fe = fieldErrors(e); if (Object.keys(fe).length) setErrors(fe); else setErr(problemMessage(e)) } finally { setBusy(false) }
  }

  const give = () => run(async () => {
    const given = Number(amount)
    setD(await contribute(id, { amount: given, anonymous: anon, message: message.trim() || undefined }))
    setThanks(given); setMessage('')
  })

  if (!d) return <div className="mc-page"><Link to="/fund" className="fd-back"><ArrowLeft size={14} /> Care Fund</Link>{err ? <Alert tone="danger">{err}</Alert> : <PageLoader />}</div>

  const c = d.card
  const p = percent(c.raisedAmount, c.goalAmount)
  const left = timeLeft(c)
  const remaining = Math.max(0, c.goalAmount - c.raisedAmount)

  return (
    <div className="mc-page mc-page-wide fd-detail">
      <Link to="/fund" className="fd-back"><ArrowLeft size={14} /> Care Fund</Link>
      {err && <Alert tone="danger">{err}</Alert>}

      {c.status === 'PENDING' && (
        <Alert tone="info">
          {d.canVerify ? 'A health worker started this fundraiser. Please check it is genuine, then approve it so the community can give.' :
            d.organiser ? 'Waiting for a verified doctor to confirm this. You will be told as soon as it goes live.' : 'This fundraiser is waiting for a doctor to confirm it.'}
        </Alert>
      )}
      {c.status === 'REJECTED' && <Alert tone="danger">This fundraiser needs changes{d.rejectReason ? `: ${d.rejectReason}` : '.'}</Alert>}
      {d.canVerify && (
        <Card><div className="fd-review">
          {!rejecting ? (
            <><div><strong>Doctor review</strong><p className="mc-hint">Approve only if you believe this need is real.</p></div>
              <div className="mc-row" style={{ gap: 8 }}>
                <Button variant="secondary" onClick={() => setRejecting(true)}>Ask for changes</Button>
                <Button loading={busy} onClick={() => run(() => verifyFund(id), load)}><ShieldCheck size={16} /> Approve</Button>
              </div></>
          ) : (
            <div style={{ display: 'grid', gap: 10, width: '100%' }}>
              <FormGroup id="reason" label="What should they fix?" error={errors.reason}>
                <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
              </FormGroup>
              <div className="mc-row" style={{ gap: 8 }}>
                <Button variant="secondary" onClick={() => setRejecting(false)}>Cancel</Button>
                <Button variant="danger" loading={busy} onClick={() => run(() => rejectFund(id, reason), load)}>Send back</Button>
              </div>
            </div>
          )}
        </div></Card>
      )}

      <div className="fd-layout">
        <div className="fd-main">
          <div className="fd-head">
            <span className="fd-need"><span aria-hidden="true">{NEED_ICON[c.need]}</span> {NEED_LABEL[c.need]}</span>
            <Badge tone={c.status === 'FUNDED' ? 'success' : c.status === 'ACTIVE' ? 'info' : 'neutral'}>{STATUS_LABEL[c.status]}</Badge>
          </div>
          <h1>{c.title}</h1>
          <p className="fd-meta">
            For <strong>{c.beneficiary}</strong> · in <Link to={`/communities/${c.communityId}`}>{c.communityName}</Link>
            {c.caseId && <> · <Link to={`/cases/${c.caseId}`}>linked case</Link></>}
          </p>
          <div className="fd-organiser">
            <span className="fd-avatar" aria-hidden="true">{c.organiserName.slice(0, 1).toUpperCase()}</span>
            <span><strong>{c.organiserName}</strong> {c.organiserDoctor && <span className="fd-verified"><BadgeCheck size={14} /> Verified doctor</span>}
              <small>{c.verifiedByName ? `Confirmed by ${c.verifiedByName}` : 'Organiser'} · started {ago(c.createdAt)}</small></span>
          </div>

          <section><h2>The story</h2><p className="fd-story">{d.story}</p></section>

          <section>
            <h2>Updates</h2>
            {d.canManage && (
              <div className="fd-post">
                <div className="fd-chips" role="radiogroup" aria-label="Type of update">
                  <button type="button" role="radio" aria-checked={upd.kind === 'UPDATE'} className={upd.kind === 'UPDATE' ? 'is-on' : ''} onClick={() => setUpd({ ...upd, kind: 'UPDATE' })}>Progress update</button>
                  <button type="button" role="radio" aria-checked={upd.kind === 'FUNDS_USED'} className={upd.kind === 'FUNDS_USED' ? 'is-on' : ''} onClick={() => setUpd({ ...upd, kind: 'FUNDS_USED' })}>How the money was used</button>
                </div>
                <FormGroup id="upd" label="" error={errors.body}>
                  <VoiceTextarea id="upd" rows={3} value={upd.body} onValue={(v) => setUpd((u) => ({ ...u, body: v }))} maxLength={1000} placeholder="Tell supporters what has happened. No phone or ID numbers." />
                </FormGroup>
                <div><Button loading={busy} disabled={upd.body.trim().length < 5} onClick={() => run(async () => setD(await postFundUpdate(id, upd)), () => setUpd({ ...upd, body: '' }))}>Post update</Button></div>
              </div>
            )}
            {d.updates.length === 0 ? <p className="mc-hint">No updates yet. Supporters get a message when there is news.</p> : (
              <ol className="fd-timeline">
                {d.updates.map((u) => (
                  <li key={u.id} className={u.kind === 'FUNDS_USED' ? 'is-used' : ''}>
                    <strong>{u.kind === 'FUNDS_USED' ? 'How the money was used' : 'Update'}</strong>
                    <p>{u.body}</p>
                    <small>{u.authorName} · {ago(u.createdAt)}</small>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <h2>Supporters</h2>
            {d.recent.length === 0 ? <EmptyState icon={<Heart size={20} />} title="Be the first to help">Even ₹10 makes a difference.</EmptyState> : (
              <ul className="fd-supporters">
                {d.recent.map((s, i) => (
                  <li key={i}><span className="fd-avatar" aria-hidden="true">{s.name.slice(0, 1).toUpperCase()}</span>
                    <span><strong>{s.name}</strong> gave {inr(s.amount)}{s.message && <em>“{s.message}”</em>}<small>{ago(s.createdAt)}</small></span></li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="fd-side">
          <Card>
            <div className="fd-give">
              <div className="fd-raised"><strong>{inr(c.raisedAmount)}</strong> <span>raised of {inr(c.goalAmount)}</span></div>
              <ProgressBar raised={c.raisedAmount} goal={c.goalAmount} />
              <div className="fd-nums"><span>{p}% · {c.supporters} supporter{c.supporters === 1 ? '' : 's'}</span><span>{left ?? (remaining > 0 ? `${inr(remaining)} to go` : '')}</span></div>

              {thanks !== null && (
                <div className="fd-thanks" role="status"><CheckCircle2 size={20} /> <div><strong>Thank you for giving {inr(thanks)}</strong><span>The organiser has been told. You will get updates here.</span></div></div>
              )}

              {d.canContribute ? (
                <>
                  <div className="fd-chips" role="group" aria-label="Choose an amount">
                    {QUICK.map((q) => <button key={q} type="button" className={amount === q ? 'is-on' : ''} onClick={() => setAmount(q)}>{inr(q)}</button>)}
                  </div>
                  <FormGroup id="amount" label="Or enter an amount" error={errors.amount}>
                    <Input id="amount" type="number" inputMode="numeric" min={10} max={100000} value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} invalid={!!errors.amount} />
                  </FormGroup>
                  <FormGroup id="msg" label="A kind word (optional)" error={errors.message}>
                    <Input id="msg" value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} placeholder="Get well soon" invalid={!!errors.message} />
                  </FormGroup>
                  <label className="fd-check"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Give anonymously</label>
                  <Button full loading={busy} disabled={!amount || Number(amount) < 10} onClick={give}><Heart size={16} /> Give {amount ? inr(Number(amount)) : ''}</Button>
                  <p className="fd-note">Demo payment: no real money moves. In the live app this opens UPI.</p>
                </>
              ) : (
                d.blockedReason && <p className="fd-note" style={{ marginTop: 12 }}>{d.blockedReason}</p>
              )}
              {!d.member && c.status === 'ACTIVE' && <Link to={`/communities/${c.communityId}`} style={{ textDecoration: 'none' }}><Button variant="secondary" full>Go to {c.communityName}</Button></Link>}
              {d.myTotal > 0 && <p className="fd-note">You have given {inr(d.myTotal)} so far.</p>}

              <div className="fd-actions">
                <Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800) }}>
                  <Copy size={14} /> {copied ? 'Link copied' : 'Share link'}
                </Button>
                {d.canManage && c.status !== 'CLOSED' && <Button variant="secondary" loading={busy} onClick={() => run(() => closeFund(id), load)}>Close fundraiser</Button>}
              </div>
            </div>
          </Card>
          <p className="fd-note">Contributions are public to the community unless you give anonymously. Never share private patient details.</p>
        </aside>
      </div>
    </div>
  )
}
