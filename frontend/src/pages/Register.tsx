import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Alert, Button, FormGroup, Input } from '../components/ui'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import { fieldErrors, problemMessage } from '../api/client'
import type { RegisterInput } from '../api/auth'

const EMPTY: RegisterInput = { email: '', password: '', displayName: '', specialty: '', licenseNumber: '', licenseCountry: '' }

export default function Register() {
  const { user, signUp } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<RegisterInput>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const set = (k: keyof RegisterInput) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setErrors({})
    setBusy(true)
    try {
      await signUp(form)
      navigate('/', { replace: true })
    } catch (err) {
      const fe = fieldErrors(err)
      setErrors(fe)
      if (Object.keys(fe).length === 0) setError(problemMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const field = (k: keyof RegisterInput, label: string, props: Partial<React.ComponentProps<typeof Input>> = {}, hint?: string) => (
    <FormGroup id={k} label={label} error={errors[k]} hint={hint}>
      <Input id={k} value={form[k]} onChange={set(k)} invalid={!!errors[k]} required {...props} />
    </FormGroup>
  )

  return (
    <AuthLayout>
      <div>
        <h2 style={{ fontSize: 24 }}>Create your account</h2>
        <p className="mc-hint">Your license is reviewed before you get the verified badge.</p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }} noValidate>
        {field('displayName', 'Full name', { autoComplete: 'name', placeholder: 'Dr. Jane Doe' })}
        {field('email', 'Work email', { type: 'email', autoComplete: 'username' })}
        {field('password', 'Password', { type: 'password', autoComplete: 'new-password' }, 'At least 10 characters with upper, lower and a digit')}
        {field('specialty', 'Specialty', { placeholder: 'Cardiology' })}
        <div className="mc-grid-2">
          {field('licenseNumber', 'License number')}
          {field('licenseCountry', 'Country (ISO)', { maxLength: 2, placeholder: 'IN' })}
        </div>
        <Button type="submit" full loading={busy}>Create account</Button>
      </form>
      <p className="mc-hint">Already registered? <Link to="/login">Sign in</Link></p>
    </AuthLayout>
  )
}
