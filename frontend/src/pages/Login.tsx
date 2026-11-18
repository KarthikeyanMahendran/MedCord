import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, FormGroup, Input, PasswordInput } from '../components/ui'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import { problemMessage } from '../api/client'

export default function Login() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email, password)
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
    } catch (err) {
      setError(problemMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <div>
        <h2>Sign in to MedCord</h2>
        <p className="mc-hint">Use the work email you registered with.</p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }} noValidate>
        <FormGroup id="email" label="Email">
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@hospital.org" />
        </FormGroup>
        <FormGroup id="password" label="Password">
          <PasswordInput id="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormGroup>
        <Button type="submit" full loading={busy} disabled={!email || !password}>Sign in</Button>
      </form>
      <div className="mc-auth-divider">New to MedCord?</div>
      <Link to="/register" style={{ textDecoration: 'none' }}><Button variant="secondary" full>Create an account</Button></Link>
    </AuthLayout>
  )
}
