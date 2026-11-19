import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Alert, Button, FormGroup, Input, PasswordInput } from '../components/ui'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import { fieldErrors, problemMessage } from '../api/client'
import { listRegions, listSpecialties } from '../api/auth'
import type { RegionOption, RegisterInput } from '../api/auth'
import { emailLooksValid, passwordChecks, passwordStrength, passwordValid } from '../lib/password'
import { roleFromParam, savedRole } from '../lib/roles'
import type { LoginRole } from '../lib/roles'

const LANGUAGES = [
  ['en', 'English'], ['ta', 'Tamil'], ['hi', 'Hindi'], ['ml', 'Malayalam'], ['te', 'Telugu'], ['kn', 'Kannada'], ['bn', 'Bengali'], ['mr', 'Marathi'],
] as const

type Form = {
  displayName: string; email: string; password: string
  regionId: string; preferredLanguage: string; organisation: string
  specialty: string; licenseNumber: string; licenseCountry: string
}
const EMPTY: Form = { displayName: '', email: '', password: '', regionId: '', preferredLanguage: 'en', organisation: '', specialty: '', licenseNumber: '', licenseCountry: 'IN' }

/**
 * The role is chosen in the sign-in window and arrives here as ?role=worker|asha|doctor.
 * Without it we use the role last picked on this device, so there is never a separate role screen.
 */
export default function Register() {
  const { user, signUp } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const picked = roleFromParam(params.get('role')) ?? savedRole()
  const role: LoginRole = picked === 'ADMIN' ? 'HEALTH_WORKER' : picked
  const isDoctor = role === 'DOCTOR'
  const isAsha = role === 'ASHA'

  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [emailTaken, setEmailTaken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [regions, setRegions] = useState<RegionOption[] | null>(null)
  const [regionsFailed, setRegionsFailed] = useState(false)
  const [specialties, setSpecialties] = useState<string[]>([])
  const formRef = useRef<HTMLFormElement>(null)

  const loadLists = () => {
    setRegionsFailed(false)
    listRegions().then(setRegions).catch(() => setRegionsFailed(true))
    listSpecialties().then(setSpecialties).catch(() => undefined)
  }
  useEffect(() => { loadLists() }, [])

  const checks = useMemo(() => passwordChecks(form.password), [form.password])
  const strength = useMemo(() => passwordStrength(form.password), [form.password])

  if (user) return <Navigate to="/" replace />

  const set = (k: keyof Form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (errors[k]) setErrors((e) => { const { [k]: _gone, ...rest } = e; return rest })
    if (k === 'email') setEmailTaken(false)
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    if (!form.displayName.trim()) e.displayName = 'Enter your full name'
    if (!emailLooksValid(form.email)) e.email = 'Enter a valid email, like name@example.org'
    if (!passwordValid(form.password)) e.password = 'Your password does not meet all the rules yet'
    if (isDoctor) {
      if (!form.specialty.trim()) e.specialty = 'Enter your speciality'
      if (!form.licenseNumber.trim()) e.licenseNumber = 'Enter your licence number'
      if (!/^[A-Za-z]{2}$/.test(form.licenseCountry)) e.licenseCountry = 'Use a 2-letter country code, like IN'
    } else {
      if (!form.regionId) e.regionId = 'Choose your area'
      if (isAsha && !form.licenseNumber.trim()) e.licenseNumber = 'Enter your ASHA / NHM ID'
    }
    return e
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    setError(null); setEmailTaken(false)
    const local = validate()
    if (Object.keys(local).length) {
      setErrors(local)
      formRef.current?.querySelector<HTMLElement>(`#${Object.keys(local)[0]}`)?.focus()
      return
    }
    setErrors({}); setBusy(true)
    const base = { email: form.email.trim(), password: form.password, displayName: form.displayName.trim() }
    const input: RegisterInput = isDoctor
      ? { ...base, accountType: 'DOCTOR', specialty: form.specialty.trim(), licenseNumber: form.licenseNumber.trim(), licenseCountry: form.licenseCountry.toUpperCase() }
      : { ...base, accountType: 'HEALTH_WORKER', workerType: isAsha ? 'ASHA' : 'CHW', regionId: form.regionId, preferredLanguage: form.preferredLanguage,
          organisation: form.organisation.trim() || undefined, licenseNumber: isAsha ? form.licenseNumber.trim() : undefined }
    try {
      await signUp(input)
      navigate('/', { replace: true })
    } catch (err) {
      const fe = fieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else {
        const msg = problemMessage(err)
        if (/email already/i.test(msg)) setEmailTaken(true)
        else setError(msg)
      }
    } finally { setBusy(false) }
  }

  const text = (k: keyof Form, label: string, props: Partial<React.ComponentProps<typeof Input>> = {}, hint?: string) => (
    <FormGroup id={k} label={label} error={errors[k]} hint={hint}>
      <Input id={k} value={form[k]} onChange={(e) => set(k, e.target.value)} invalid={!!errors[k]} {...props} />
    </FormGroup>
  )

  return (
    <AuthLayout>
      <div>
        <h2>Create your account</h2>
        <p className="mc-hint">
          {isDoctor ? 'We review your licence before your profile shows the verified mark. You can browse while you wait.' : 'You can send your first case as soon as you finish.'}
        </p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {emailTaken && <Alert tone="info">An account with this email already exists. <Link to="/login">Sign in instead</Link></Alert>}
      <form ref={formRef} onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }} noValidate>
        {text('displayName', 'Full name', { autoComplete: 'name', placeholder: isDoctor ? 'Dr. Jane Doe' : 'Kavitha Raman', autoFocus: true })}
        {text('email', isDoctor ? 'Work email' : 'Email', { type: 'email', autoComplete: 'username', placeholder: 'name@example.org' })}

        <FormGroup id="password" label="Password" error={errors.password}>
          <PasswordInput id="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} invalid={!!errors.password} />
          <div className="mc-meter" aria-hidden="true"><span className={`s${strength.score}`} style={{ width: `${strength.score * 25}%` }} /></div>
          <ul className="mc-rules" aria-label="Password rules">
            {checks.map((c) => <li key={c.id} className={c.ok ? 'is-ok' : ''}><Check size={12} />{c.label}</li>)}
            {strength.label && <li className="mc-rules-score">{strength.label}</li>}
          </ul>
        </FormGroup>

        {isDoctor ? (
          <>
            <FormGroup id="specialty" label="Speciality" error={errors.specialty}>
              <Input id="specialty" list="mc-specialties" value={form.specialty} onChange={(e) => set('specialty', e.target.value)} invalid={!!errors.specialty} placeholder="Cardiology" autoComplete="off" />
              <datalist id="mc-specialties">{specialties.map((s) => <option key={s} value={s} />)}</datalist>
            </FormGroup>
            <div className="mc-grid-2">
              {text('licenseNumber', 'Licence number')}
              {text('licenseCountry', 'Country code', { maxLength: 2, placeholder: 'IN', autoCapitalize: 'characters' }, 'Two letters')}
            </div>
          </>
        ) : (
          <>
            {isAsha && text('licenseNumber', 'ASHA / NHM ID card number', { placeholder: 'ASHA / NHM ID', autoComplete: 'off', autoCapitalize: 'characters' }, 'The ID number on your ASHA / NHM card. You will use it to sign in.')}
            <FormGroup id="regionId" label="Your area" error={errors.regionId} hint={regions === null && !regionsFailed ? 'Loading areas…' : 'The district where you work. Cases are mapped to it.'}>
              <select id="regionId" className="mc-select mc-select-block" value={form.regionId} onChange={(e) => set('regionId', e.target.value)} aria-invalid={!!errors.regionId || undefined}>
                <option value="">Choose your area</option>
                {(regions ?? []).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.district}, {r.state}</option>)}
              </select>
            </FormGroup>
            {regionsFailed && <Alert tone="danger">Could not load the areas. <button type="button" className="mc-linkbtn" onClick={loadLists}>Try again</button></Alert>}
            <div className="mc-grid-2">
              <FormGroup id="preferredLanguage" label="Your language">
                <select id="preferredLanguage" className="mc-select mc-select-block" value={form.preferredLanguage} onChange={(e) => set('preferredLanguage', e.target.value)}>
                  {LANGUAGES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                </select>
              </FormGroup>
              {text('organisation', 'Health centre (optional)', { placeholder: 'PHC or NGO name', maxLength: 160 })}
            </div>
          </>
        )}

        <Button type="submit" full loading={busy}>{isDoctor ? 'Create account' : 'Create account and start'}</Button>
        <p className="mc-hint">Use test data only. Never enter real patient details. By continuing you agree to use this demo responsibly.</p>
      </form>
      <p className="mc-hint">Already registered? <Link to="/login">Sign in</Link></p>
    </AuthLayout>
  )
}
