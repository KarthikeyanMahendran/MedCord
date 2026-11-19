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

const submitBtn = () => screen.getByRole('button', { name: /^Sign in as/i })
const axiosErr = (status: number, detail: string) =>
  Object.assign(new Error('x'), { isAxiosError: true, response: { status, data: { detail } } })
const MISMATCH = 'The role or ID details do not match this account. Check your choice and try again.'

describe('Login page', () => {
  beforeEach(() => {
    vi.resetAllMocks(); localStorage.clear()
    vi.mocked(authApi.listSpecialties).mockResolvedValue(['Cardiology', 'Pediatrics'])
  })

  it('offers a role menu and signs a health worker in with just email and password', async () => {
    vi.mocked(authApi.login).mockResolvedValue()
    vi.mocked(authApi.fetchMe).mockResolvedValue(me({ accountType: 'HEALTH_WORKER' }))
    setup()
    for (const name of [/Health worker/, /ASHA worker/, /Doctor/, /Admin/]) expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    expect(screen.queryByLabelText('Licence number')).toBeNull()
    expect(screen.queryByLabelText('Speciality')).toBeNull()

    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.click(submitBtn())
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument())
    expect(authApi.login).toHaveBeenCalledWith('a@b.c', 'secret', { accountType: 'HEALTH_WORKER', workerType: 'CHW' })
  })

  it('asks an ASHA worker for the ASHA / NHM ID card number and sends it', async () => {
    vi.mocked(authApi.login).mockResolvedValue()
    vi.mocked(authApi.fetchMe).mockResolvedValue(me({ accountType: 'HEALTH_WORKER' }))
    setup()
    await userEvent.click(screen.getByRole('radio', { name: /ASHA worker/ }))
    expect(screen.queryByLabelText('Speciality')).toBeNull()
    await userEvent.type(screen.getByLabelText('Email'), 'meena@x.org')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    expect(submitBtn()).toBeDisabled()

    await userEvent.type(screen.getByLabelText('ASHA / NHM ID card number'), 'NHM-1234')
    expect(submitBtn()).toBeEnabled()
    await userEvent.click(submitBtn())
    await waitFor(() => expect(authApi.login).toHaveBeenCalledWith('meena@x.org', 'secret', { accountType: 'HEALTH_WORKER', workerType: 'ASHA', licenseNumber: 'NHM-1234' }))
  })

  it('asks a doctor for speciality and licence number, and will not submit without both', async () => {
    vi.mocked(authApi.login).mockResolvedValue()
    vi.mocked(authApi.fetchMe).mockResolvedValue(me())
    setup()
    await userEvent.click(screen.getByRole('radio', { name: /Doctor/ }))
    await userEvent.type(screen.getByLabelText('Email'), 'priya@x.org')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    expect(submitBtn()).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Speciality'), 'Cardiology')
    expect(submitBtn()).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Licence number'), 'TN-CARD-48211')
    expect(submitBtn()).toBeEnabled()
    await userEvent.click(submitBtn())
    await waitFor(() => expect(authApi.login).toHaveBeenCalledWith('priya@x.org', 'secret', { accountType: 'DOCTOR', specialty: 'Cardiology', licenseNumber: 'TN-CARD-48211' }))
  })

  it('autofills the doctor\'s speciality and licence number this device used before, and the role', async () => {
    vi.mocked(authApi.login).mockResolvedValue()
    vi.mocked(authApi.fetchMe).mockResolvedValue(me())
    const first = setup()
    await userEvent.click(screen.getByRole('radio', { name: /Doctor/ }))
    await userEvent.type(screen.getByLabelText('Email'), 'priya@x.org')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.type(screen.getByLabelText('Speciality'), 'Cardiology')
    await userEvent.type(screen.getByLabelText('Licence number'), 'TN-CARD-48211')
    await userEvent.click(submitBtn())
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument())
    first.unmount()

    setup()   // a later visit on the same device
    expect(screen.getByRole('radio', { name: /Doctor/ })).toBeChecked()
    await userEvent.type(screen.getByLabelText('Email'), 'priya@x.org')
    await waitFor(() => expect(screen.getByLabelText('Licence number')).toHaveValue('TN-CARD-48211'))
    expect(screen.getByLabelText('Speciality')).toHaveValue('Cardiology')
    expect(screen.getByText(/Filled in from this device/i)).toBeInTheDocument()
  })

  it('does not hand one person\'s ID to a different email', async () => {
    localStorage.setItem('mc_login_role', 'DOCTOR')
    localStorage.setItem('mc_login_ids', JSON.stringify({ 'DOCTOR|priya@x.org': { licence: 'TN-CARD-48211', specialty: 'Cardiology' } }))
    setup()
    await userEvent.type(screen.getByLabelText('Email'), 'other@x.org')
    expect(screen.getByLabelText('Licence number')).toHaveValue('')
  })

  it('shows the role and ID mismatch message from the server', async () => {
    vi.mocked(authApi.login).mockRejectedValue(axiosErr(401, MISMATCH))
    setup()
    await userEvent.click(screen.getByRole('radio', { name: /Doctor/ }))
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.type(screen.getByLabelText('Speciality'), 'Cardiology')
    await userEvent.type(screen.getByLabelText('Licence number'), 'WRONG-1')
    await userEvent.click(submitBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent(/role or ID details do not match/i)
  })

  it('shows a clear message for a wrong password', async () => {
    vi.mocked(authApi.login).mockRejectedValue(axiosErr(401, 'Invalid email or password'))
    setup()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
    await userEvent.type(screen.getByLabelText('Password'), 'bad')
    await userEvent.click(submitBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent(/email and password do not match/i)
  })

  it('shows an error alert when login fails unexpectedly', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new Error('boom'))
    setup()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
    await userEvent.type(screen.getByLabelText('Password'), 'bad')
    await userEvent.click(submitBtn())
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
  })

  it('has a back link to the landing page', () => {
    setup()
    expect(screen.getByRole('link', { name: /Back to home/i })).toHaveAttribute('href', '/welcome')
  })

  it('disables submit until both fields are filled', () => {
    setup()
    expect(submitBtn()).toBeDisabled()
  })

  it('fills everything from the doctor demo button, including speciality and licence number', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Doctor' }))
    expect(screen.getByLabelText('Email')).toHaveValue('priya.raman@medcord.dev')
    expect(screen.getByLabelText('Speciality')).toHaveValue('Cardiology')
    expect(screen.getByLabelText('Licence number')).toHaveValue('TN-CARD-48211')
    expect(screen.getByRole('radio', { name: /Doctor/ })).toBeChecked()
  })

  it('sends new users to the sign-up for the role they picked, and has none for admins', async () => {
    setup()
    await userEvent.click(screen.getByRole('radio', { name: /ASHA worker/ }))
    expect(screen.getByRole('button', { name: 'Create an ASHA worker account' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Admin/ }))
    expect(screen.queryByRole('button', { name: /Create/ })).toBeNull()
    expect(screen.getByText(/added by the platform admin/i)).toBeInTheDocument()
  })
})
