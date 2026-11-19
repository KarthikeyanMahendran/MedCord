import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { HeartHandshake, HeartPulse, ShieldCheck, Stethoscope } from 'lucide-react'
import { Alert, Button, FormGroup, Input, PasswordInput } from '../components/ui'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import { fieldErrors, problemMessage } from '../api/client'
import { listSpecialties } from '../api/auth'
import type { LoginRole as LoginPayload } from '../api/auth'
import { REGISTER_PARAM, ROLE_NOUN, ROLE_TITLE, rememberLogin, savedIdentity, savedRole } from '../lib/roles'
import type { LoginRole } from '../lib/roles'

const ROLE_ICONS: Record<LoginRole, typeof Stethoscope> = { HEALTH_WORKER: HeartHandshake, ASHA: HeartPulse, DOCTOR: Stethoscope, ADMIN: ShieldCheck }
const ROLE_ORDER: LoginRole[] = ['HEALTH_WORKER', 'ASHA', 'DOCTOR', 'ADMIN']

// Quick-fill buttons for demos. Shown in development, or when VITE_DEMO_LOGINS=true. Only the public demo seed accounts are listed.
const DEMO_LOGINS = import.meta.env.DEV || import.meta.env.VITE_DEMO_LOGINS === 'true'
const DEMOS: { label: string; role: LoginRole; email: string; password: string; licence?: string; specialty?: string }[] = [
  { label: 'Health worker', role: 'HEALTH_WORKER', email: 'kavitha.worker@medcord.dev', password: 'Passw0rd!Med' },
  { label: 'Doctor', role: 'DOCTOR', email: 'priya.raman@medcord.dev', password: 'Passw0rd!Med', licence: 'TN-CARD-48211', specialty: 'Cardiology' },
]

function loginMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail
    if (status === 401) return detail && /role or ID/i.test(detail) ? detail : 'That email and password do not match. Check them and try again.'
    if (status === 429) return 'Too many attempts. Please wait a minute and try again.'
  }
  return problemMessage(err)
}

/** What each role must give besides email and password. */
const NEEDS_ID = (r: LoginRole) => r === 'ASHA' || r === 'DOCTOR'

export default function Login() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [role, setRole] = useState<LoginRole>(savedRole)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [licence, setLicence] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [specialties, setSpecialties] = useState<string[]>([])
  const [autofilled, setAutofilled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const typed = useRef(false)   // once the user types an ID themselves, never overwrite it

  const isDoctor = role === 'DOCTOR'
  const isAsha = role === 'ASHA'

  useEffect(() => { if (isDoctor && specialties.length === 0) listSpecialties().then(setSpecialties).catch(() => undefined) }, [isDoctor, specialties.length])

  // Autofill the ID details this device used last time for this role and email.
  useEffect(() => {
    if (!NEEDS_ID(role) || typed.current || licence) return
    const saved = savedIdentity(role, email)
    if (saved.licence) { setLicence(saved.licence); if (role === 'DOCTOR' && !specialty) setSpecialty(saved.specialty); setAutofilled(true) }
  }, [email, role, licence, specialty])

  if (user) return <Navigate to="/" replace />

  const chooseRole = (r: LoginRole) => { setRole(r); setError(null); setErrors({}); typed.current = false; setLicence(''); setSpecialty(''); setAutofilled(false) }

  function fillDemo(d: (typeof DEMOS)[number]) {
    setRole(d.role); setEmail(d.email); setPassword(d.password)
    typed.current = true
    setLicence(d.licence ?? ''); setSpecialty(d.specialty ?? ''); setAutofilled(Boolean(d.licence))
    setError(null); setErrors({})
  }

  const idMissing = (isDoctor && (!licence.trim() || !specialty.trim())) || (isAsha && !licence.trim())

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null); setErrors({})
    const local: Record<string, string> = {}
    if (isDoctor && !specialty.trim()) local.specialty = 'Enter your speciality'
    if (NEEDS_ID(role) && !licence.trim()) local.licenseNumber = isAsha ? 'Enter your ASHA / NHM ID' : 'Enter your licence number'
    if (Object.keys(local).length) { setErrors(local); return }

    const payload: LoginPayload = isDoctor
      ? { accountType: 'DOCTOR', specialty: specialty.trim(), licenseNumber: licence.trim() }
      : isAsha ? { accountType: 'HEALTH_WORKER', workerType: 'ASHA', licenseNumber: licence.trim() }
      : role === 'ADMIN' ? { accountType: 'ADMIN' } : { accountType: 'HEALTH_WORKER', workerType: 'CHW' }
    setBusy(true)
    try {
      await signIn(email, password, payload)
      rememberLogin(role, email, { licence, specialty })
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
    } catch (err) {
      const fe = fieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else setError(loginMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const noun = ROLE_NOUN[role]
  const article = /^[aeiou]/i.test(noun) ? 'an' : 'a'
  const registerTo = REGISTER_PARAM[role] ? `/register?role=${REGISTER_PARAM[role]}` : null

  return (
    <AuthLayout>
      <div>
        <h2>Sign in to MedCord</h2>
        <p className="mc-hint">Choose who you are, then enter your details.</p>
      </div>

      <div className="mc-signin-roles" role="radiogroup" aria-label="I am a">
        {ROLE_ORDER.map((id) => {
          const Icon = ROLE_ICONS[id]
          return (
            <button key={id} type="button" role="radio" aria-checked={role === id} className={`mc-signin-role ${role === id ? 'is-on' : ''}`} onClick={() => chooseRole(id)}>
              <Icon size={17} /><span>{ROLE_TITLE[id]}</span>
            </button>
          )
        })}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }} noValidate>
        <FormGroup id="email" label="Email">
          <Input id="email" type="email" name="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@hospital.org" />
        </FormGroup>
        <FormGroup id="password" label="Password">
          <PasswordInput id="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormGroup>

        {isDoctor && (
          <FormGroup id="specialty" label="Speciality" error={errors.specialty}>
            <Input id="specialty" name="specialty" list="mc-login-specialties" autoComplete="off" required value={specialty} invalid={!!errors.specialty} placeholder="Cardiology"
              onChange={(e) => { typed.current = true; setAutofilled(false); setSpecialty(e.target.value) }} />
            <datalist id="mc-login-specialties">{specialties.map((s) => <option key={s} value={s} />)}</datalist>
          </FormGroup>
        )}
        {NEEDS_ID(role) && (
          <FormGroup id="licenseNumber" label={isAsha ? 'ASHA / NHM ID card number' : 'Licence number'} error={errors.licenseNumber}
            hint={autofilled ? 'Filled in from this device. Change it if it is not yours.' : isAsha ? 'The ID number on your ASHA / NHM card.' : 'The licence number you registered with, for example TN-CARD-48211.'}>
            <Input id="licenseNumber" name="licenseId" autoComplete="off" autoCapitalize="characters" spellCheck={false} required value={licence}
              invalid={!!errors.licenseNumber} placeholder={isAsha ? 'ASHA / NHM ID' : 'Licence number'}
              onChange={(e) => { typed.current = true; setAutofilled(false); setLicence(e.target.value) }} />
          </FormGroup>
        )}
        <Button type="submit" full loading={busy} disabled={!email || !password || idMissing}>Sign in as {noun === 'admin' ? 'an admin' : `${article} ${noun}`}</Button>
      </form>

      {DEMO_LOGINS && (
        <div className="mc-demo" aria-label="Demo accounts">
          <span>Try a demo account</span>
          {DEMOS.map((d) => <button key={d.label} type="button" onClick={() => fillDemo(d)}>{d.label}</button>)}
        </div>
      )}

      <div className="mc-auth-divider">New to MedCord?</div>
      {registerTo ? (
        <Link to={registerTo} style={{ textDecoration: 'none' }}><Button variant="secondary" full>Create {article} {noun} account</Button></Link>
      ) : (
        <p className="mc-hint" style={{ textAlign: 'center' }}>Admin accounts are added by the platform admin.</p>
      )}
    </AuthLayout>
  )
}
