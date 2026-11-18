import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'
import { AuthProvider } from '../context/AuthContext'
import * as authApi from '../api/auth'

vi.mock('../api/auth')

function setup() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div>HOME</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Login page', () => {
  beforeEach(() => vi.resetAllMocks())

  it('submits credentials and navigates home', async () => {
    vi.mocked(authApi.login).mockResolvedValue()
    vi.mocked(authApi.fetchMe).mockResolvedValue({
      id: '1', email: 'a@b.c', displayName: 'Dr A', status: 'ACTIVE', platformRole: 'USER',
      specialty: 'X', licenseCountry: 'IN', verificationStatus: 'APPROVED', bio: null, rejectionReason: null,
    })
    setup()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument())
    expect(authApi.login).toHaveBeenCalledWith('a@b.c', 'secret')
  })

  it('shows an error alert when login fails', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new Error('boom'))
    setup()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
    await userEvent.type(screen.getByLabelText('Password'), 'bad')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
  })

  it('disables submit until both fields are filled', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
  })
})
