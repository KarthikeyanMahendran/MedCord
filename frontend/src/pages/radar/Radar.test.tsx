import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AlertDetail, OutbreakAlert, Radar } from '../../api/outbreaks'

vi.mock('../../api/outbreaks', async (orig) => ({
  ...(await orig<typeof import('../../api/outbreaks')>()),
  getRadar: vi.fn(), getAlert: vi.fn(), acknowledgeAlert: vi.fn(), resolveAlert: vi.fn(), runDemo: vi.fn(), resetDemo: vi.fn(),
}))

import { acknowledgeAlert, getAlert, getRadar, runDemo } from '../../api/outbreaks'
import RadarPage from './Radar'

const iso = new Date().toISOString()
const alert: OutbreakAlert = {
  id: 'a1', regionId: 'r1', regionName: 'Wayanad Hills', district: 'Wayanad', state: 'Kerala', lat: 11.68, lng: 76.13,
  syndrome: 'FEVER_RASH', syndromeLabel: 'Fever with rash', severity: 'WATCH', status: 'OPEN', caseCount: 3, redCount: 0, threshold: 3,
  firstCaseAt: iso, lastCaseAt: iso, demo: false, acknowledgedAt: null, acknowledgedBy: null, note: null, createdAt: iso, resolvedAt: null,
}
const detail: AlertDetail = {
  alert, guidance: ['Report the cluster to the district surveillance officer today.'], disclaimer: 'Decision support only.',
  canSeeCases: true, cases: [{ village: 'Meppadi', age: 4, sex: 'male', urgency: 'AMBER', summary: 'Child with fever and rash', createdAt: iso }],
  timeline: [0, 0, 0, 1, 1, 1], bucketHours: 12,
}
const radar = (over: Partial<Radar> = {}): Radar => ({
  alerts: [alert], windowHours: 72, canManage: true, isAdmin: false,
  regions: [{ id: 'r1', name: 'Wayanad Hills', district: 'Wayanad', state: 'Kerala', lat: 11.68, lng: 76.13, cases72h: 3 }], ...over,
})

describe('Outbreak radar page', () => {
  beforeEach(() => {
    vi.mocked(getRadar).mockReset(); vi.mocked(getAlert).mockReset(); vi.mocked(acknowledgeAlert).mockReset(); vi.mocked(runDemo).mockReset()
    vi.mocked(getAlert).mockResolvedValue(detail)
  })

  it('says all quiet when there is no cluster', async () => {
    vi.mocked(getRadar).mockResolvedValue(radar({ alerts: [] }))
    render(<RadarPage />)
    expect((await screen.findAllByText(/All quiet/)).length).toBeGreaterThan(0)
    expect(screen.queryByText('Fever with rash')).toBeNull()
  })

  it('shows the alert, what to do and the anonymised cases, and lets staff acknowledge', async () => {
    vi.mocked(getRadar).mockResolvedValue(radar())
    vi.mocked(acknowledgeAlert).mockResolvedValue({ ...alert, status: 'ACKNOWLEDGED' })
    render(<RadarPage />)

    expect((await screen.findAllByText('Fever with rash')).length).toBeGreaterThan(0)
    expect(await screen.findByText(/Report the cluster to the district surveillance officer/)).toBeInTheDocument()
    expect(screen.getByText(/Meppadi/)).toBeInTheDocument()
    expect(screen.getByRole('application', { name: /Map of monitored areas/i })).toBeInTheDocument()   // real map

    await userEvent.click(await screen.findByRole('button', { name: 'Acknowledge' }))
    await waitFor(() => expect(acknowledgeAlert).toHaveBeenCalledWith('a1', ''))
  })

  it('only admins get the demo controls', async () => {
    vi.mocked(getRadar).mockResolvedValue(radar({ isAdmin: false }))
    const { unmount } = render(<RadarPage />)
    await screen.findAllByText('Fever with rash')
    expect(screen.queryByRole('button', { name: /Simulate outbreak/i })).toBeNull()
    unmount()

    vi.mocked(getRadar).mockResolvedValue(radar({ isAdmin: true }))
    render(<RadarPage />)
    expect(await screen.findByRole('button', { name: /Simulate outbreak/i })).toBeInTheDocument()
  })

  it('hides the case list and actions from health workers', async () => {
    vi.mocked(getRadar).mockResolvedValue(radar({ canManage: false }))
    vi.mocked(getAlert).mockResolvedValue({ ...detail, canSeeCases: false, cases: [] })
    render(<RadarPage />)
    await screen.findByText(/Report the cluster/)
    expect(screen.queryByText(/Meppadi/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull()
    expect(screen.getByText(/Health notice for your area/)).toBeInTheDocument()
  })
})
