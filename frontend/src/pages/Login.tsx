import { useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, FormGroup, Input, PasswordInput } from '../components/ui'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import { fieldErrors, problemMessage } from '../api/client'

// Demo accounts for judges and visitors. They hold test data only.
const DEMOS: { role: string; hint: string; email: string; password: string }[] = [
  { role: 'Health worker', hint: 'Send a patient case, ask for help, check in', email: 'worker@medcord.com', password: 'Worker1234' },
  { role: 'Doctor', hint: 'Accept cases, answer, raise funds', email: 'doctor@medcord.com', password: 'Doctor1234' },
  { role: 'Admin', hint: 'Verify doctors, outbreak radar, impact', email: 'admin@gmail.com', password: 'Admin1234' },
]

function loginMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 401) return 'That email and password do not match. Check them and try again.'
    if (err.response?.status === 429) return 'Too many attempts. Please wait a minute and try again.'
  }
  return problemMessage(err)
}

/** Sign in is only email and password. The role was chosen when the account was created. */
export default function Login() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function quickSignIn(d: { email: string; password: string }) {
    setEmail(d.email); setPassword(d.password); setError(null); setErrors({}); setBusy(true)
    try { await signIn(d.email, d.password); navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true }) }
    catch (err) { setError(loginMessage(err)) } finally { setBusy(false) }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null); setErrors({})
    setBusy(true)
    try {
      await signIn(email, password)
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
    } catch (err) {
      const fe = fieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else setError(loginMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <div>
        <h2>Welcome back</h2>
        <p className="mc-hint">Sign in with your email and password.</p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }} noValidate>
        <FormGroup id="email" label="Email" error={errors.email}>
          <Input id="email" type="email" name="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@hospital.org" />
        </FormGroup>
        <FormGroup id="password" label="Password" error={errors.password}>
          <PasswordInput id="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormGroup>
        <Button type="submit" full loading={busy} disabled={!email || !password}>Sign in</Button>
      </form>

      <div className="mc-demo-row" aria-label="Demo accounts">
        <span className="mc-demo-label">Try a demo:</span>
        {DEMOS.map((d) => (
          <button key={d.role} type="button" className="mc-demo-chip" disabled={busy} title={`${d.email} / ${d.password}`} onClick={() => void quickSignIn(d)}>
            {d.role === 'Health worker' ? 'Worker' : d.role}
          </button>
        ))}
      </div>

      <div className="mc-auth-divider">New user?</div>
      <Link to="/register" style={{ textDecoration: 'none' }}><Button variant="secondary" full>Create a new account</Button></Link>
      <p className="mc-hint" style={{ textAlign: 'center', margin: 0 }}>Are you a doctor? <Link to="/register?role=doctor">Join as a doctor</Link></p>
    </AuthLayout>
  )
}
