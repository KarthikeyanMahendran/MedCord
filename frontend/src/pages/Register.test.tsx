import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Register from './Register'
import { AuthProvider } from '../context/AuthContext'
import * as authApi from '../api/auth'

vi.mock('../api/auth')

const me = (over: Partial<authApi.Me> = {}): authApi.Me => ({
  id: '1', email: 'a@b.co', displayName: 'A', status: 'ACTIVE', platformRole: 'USER', specialty: null, licenseCountry: null,
  verificationStatus: 'PENDING', bio: null, rejectionReason: null, ...over,
})

function setup(url = '/register') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<div>LOGIN</div>} />
          <Route path="/" element={<div>HOME</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const REGIONS = [{ id: 'r1', name: 'Wayanad Hills', district: 'Wayanad', state: 'Kerala' }]

async function fillCommon() {
  await userEvent.type(screen.getByLabelText('Full name'), 'Kavitha Raman')
  await userEvent.type(screen.getByLabelText(/email/i), 'kavitha@example.org')
  await userEvent.type(screen.getByLabelText('Password'), 'Str0ngPassw0rd')
}

describe('Register page', () => {
  beforeEach(() => {
    vi.resetAllMocks(); localStorage.clear()
    vi.mocked(authApi.listRegions).mockResolvedValue(REGIONS)
    vi.mocked(authApi.listSpecialties).mockResolvedValue(['Cardiology'])
  })

  it('lets you pick the role here, since sign-in no longer asks', async () => {
    setup('/register?role=worker')
    expect(screen.getByRole('heading', { name: /Create your account/i })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByText(/Signing up as health worker/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to sign in/i })).toHaveAttribute('href', '/login')
  })

  it('signs up a health worker with an area and no ID, then goes home', async () => {
    vi.mocked(authApi.register).mockResolvedValue()
    vi.mocked(authApi.fetchMe).mockResolvedValue(me({ accountType: 'HEALTH_WORKER' }))
    setup('/register?role=worker')
    expect(screen.queryByLabelText(/NHM ID/)).toBeNull()
    expect(screen.queryByLabelText('Licence number')).toBeNull()
    await fillCommon()
    await userEvent.selectOptions(await screen.findByLabelText('Your area'), 'r1')
    await userEvent.click(screen.getByRole('button', { name: /Create account and start/i }))

    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument())
    const sent = vi.mocked(authApi.register).mock.calls[0][0]
    expect(sent).toMatchObject({ accountType: 'HEALTH_WORKER', workerType: 'CHW', regionId: 'r1', email: 'kavitha@example.org', preferredLanguage: 'en' })
    expect(sent.licenseNumber).toBeUndefined()
    expect(sent.specialty).toBeUndefined()
  })

  it('requires the ASHA / NHM ID card number for an ASHA worker and sends it', async () => {
    vi.mocked(authApi.register).mockResolvedValue()
    vi.mocked(authApi.fetchMe).mockResolvedValue(me({ accountType: 'HEALTH_WORKER' }))
    setup('/register?role=asha')
    expect(screen.getByText(/Signing up as ASHA worker/i)).toBeInTheDocument()
    await fillCommon()
    await userEvent.selectOptions(await screen.findByLabelText('Your area'), 'r1')
    await userEvent.click(screen.getByRole('button', { name: /Create account and start/i }))
    expect(await screen.findByText('Enter your ASHA / NHM ID')).toBeInTheDocument()
    expect(authApi.register).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('ASHA / NHM ID card number'), 'NHM-1234')
    await userEvent.click(screen.getByRole('button', { name: /Create account and start/i }))
    await waitFor(() => expect(authApi.register).toHaveBeenCalledWith(expect.objectContaining({ accountType: 'HEALTH_WORKER', workerType: 'ASHA', licenseNumber: 'NHM-1234' })))
  })

  it('asks a doctor for speciality and licence number and says exactly what is missing', async () => {
    setup('/register?role=doctor')
    expect(screen.getByText(/Signing up as doctor/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Enter your full name')).toBeInTheDocument()
    expect(screen.getByText(/valid email/i)).toBeInTheDocument()
    expect(screen.getByText('Enter your speciality')).toBeInTheDocument()
    expect(screen.getByText('Enter your licence number')).toBeInTheDocument()
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('sends a doctor sign-up with speciality, licence and country', async () => {
    vi.mocked(authApi.register).mockResolvedValue()
    vi.mocked(authApi.fetchMe).mockResolvedValue(me({ accountType: 'DOCTOR' }))
    setup('/register?role=doctor')
    await fillCommon()
    await userEvent.type(screen.getByLabelText('Speciality'), 'Cardiology')
    await userEvent.type(screen.getByLabelText('Licence number'), 'TN-CARD-48211')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(authApi.register).toHaveBeenCalledWith(expect.objectContaining({
      accountType: 'DOCTOR', specialty: 'Cardiology', licenseNumber: 'TN-CARD-48211', licenseCountry: 'IN' })))
  })

  it('uses the role last picked on this device when the link has none', async () => {
    localStorage.setItem('mc_login_role', 'DOCTOR')
    setup('/register')
    expect(screen.getByText(/Signing up as doctor/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Licence number')).toBeInTheDocument()
  })

  it('shows live password rules', async () => {
    setup('/register?role=doctor')
    const pw = screen.getByLabelText('Password')
    await userEvent.type(pw, 'abc')
    expect(screen.getByText('At least 10 characters').closest('li')).not.toHaveClass('is-ok')
    await userEvent.clear(pw)
    await userEvent.type(pw, 'Str0ngPassw0rd')
    expect(screen.getByText('At least 10 characters').closest('li')).toHaveClass('is-ok')
    expect(screen.getByText('A number').closest('li')).toHaveClass('is-ok')
  })

  it('points a duplicate email to sign in', async () => {
    const err = Object.assign(new Error('conflict'), { isAxiosError: true, response: { status: 409, data: { detail: 'Email already registered' } } })
    vi.mocked(authApi.register).mockRejectedValue(err)
    setup('/register?role=worker')
    await fillCommon()
    await userEvent.selectOptions(await screen.findByLabelText('Your area'), 'r1')
    await userEvent.click(screen.getByRole('button', { name: /Create account and start/i }))
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Sign in instead/i })).toBeInTheDocument()
  })
})
