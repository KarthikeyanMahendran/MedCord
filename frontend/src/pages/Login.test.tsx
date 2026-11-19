import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'
import { AuthProvider } from '../context/AuthContext'
import * as authApi from '../api/auth'

vi.mock('../api/auth')

const me = (over: Partial<authApi.Me> = {}): authApi.Me => ({
  id: '1', email: 'a@b.c', displayName: 'Dr A', status: 'ACTIVE', platformRole: 'USER',
  specialty: 'X', licenseCountry: 'IN', verificationStatus: 'APPROVED', bio: null, rejectionReason: null, ...over,
})

function setup() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<div>REGISTER</div>} />
          <Route path="/" element={<div>HOME</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const axiosErr = (status: number) => Object.assign(new Error('x'), { isAxiosError: true, response: { status, data: {} } })

describe('Login page', () => {
  beforeEach(() => { vi.resetAllMocks(); localStorage.clear() })

  it('asks only for email and password, with no role choice', () => {
    setup()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByLabelText(/licen[cs]e|speciality|NHM/i)).toBeNull()
  })

  it('keeps the button off until both fields are filled, then signs in and goes home', async () => {
    vi.mocked(authApi.login).mockResolvedValue(undefined as never)
    vi.mocked(authApi.fetchMe).mockResolvedValue(me())
    const u = userEvent.setup()
    setup()
    const btn = screen.getByRole('button', { name: /^sign in$/i })
    expect(btn).toBeDisabled()
    await u.type(screen.getByLabelText(/email/i), 'a@b.c')
    await u.type(screen.getByLabelText(/^password/i), 'Passw0rd!Med')
    expect(btn).toBeEnabled()
    await u.click(btn)
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument())
    expect(authApi.login).toHaveBeenCalledWith('a@b.c', 'Passw0rd!Med', undefined)
  })

  it('shows a plain message for a wrong password', async () => {
    vi.mocked(authApi.login).mockRejectedValue(axiosErr(401))
    const u = userEvent.setup()
    setup()
    await u.type(screen.getByLabelText(/email/i), 'a@b.c')
    await u.type(screen.getByLabelText(/^password/i), 'nope')
    await u.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i)
  })

  it('links to account creation', async () => {
    const u = userEvent.setup()
    setup()
    await u.click(screen.getByRole('button', { name: /create a new account/i }))
    expect(await screen.findByText('REGISTER')).toBeInTheDocument()
  })
})
