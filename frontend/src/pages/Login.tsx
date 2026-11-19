import { useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, FormGroup, Input, PasswordInput } from '../components/ui'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import { fieldErrors, problemMessage } from '../api/client'

// Quick-fill buttons for demos. Shown in development, or when VITE_DEMO_LOGINS=true. Only the public demo seed accounts are listed.
const DEMO_LOGINS = import.meta.env.DEV || import.meta.env.VITE_DEMO_LOGINS === 'true'
const DEMOS: { label: string; email: string; password: string }[] = [
  { label: 'Health worker', email: 'kavitha.worker@medcord.dev', password: 'Passw0rd!Med' },
  { label: 'Doctor', email: 'priya.raman@medcord.dev', password: 'Passw0rd!Med' },
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

      {DEMO_LOGINS && (
        <div className="mc-demo" aria-label="Demo accounts">
          <span>Try a demo account</span>
          {DEMOS.map((d) => <button key={d.label} type="button" onClick={() => { setEmail(d.email); setPassword(d.password); setError(null) }}>{d.label}</button>)}
        </div>
      )}

      <div className="mc-auth-divider">New to MedCord?</div>
      <Link to="/register" style={{ textDecoration: 'none' }}><Button variant="secondary" full>Create an account</Button></Link>
    </AuthLayout>
  )
}
