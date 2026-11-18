import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Verifications from './Verifications'
import * as adminApi from '../../api/admin'

vi.mock('../../api/admin')

const item = (o: Partial<adminApi.VerificationItem> = {}): adminApi.VerificationItem => ({
  userId: 'u1', displayName: 'Nina Kapoor', email: 'nina@x.dev', specialty: 'ICU Nursing', licenseNumber: 'RN-1',
  licenseCountry: 'IN', status: 'PENDING', submittedAt: '2026-11-01T00:00:00Z', verifiedAt: null, ...o,
})
const page = (items: adminApi.VerificationItem[]) => ({ items, page: 0, size: 10, total: items.length, totalPages: 1 })

describe('Verification queue', () => {
  beforeEach(() => vi.resetAllMocks())

  it('lists pending requests and approves one', async () => {
    vi.mocked(adminApi.listVerifications).mockResolvedValue(page([item()]))
    vi.mocked(adminApi.decideVerification).mockResolvedValue(item({ status: 'APPROVED' }))
    render(<Verifications />)
    expect(await screen.findByText('Nina Kapoor')).toBeInTheDocument()
    expect(adminApi.listVerifications).toHaveBeenCalledWith('PENDING', 0)
    await userEvent.click(screen.getByRole('button', { name: 'Approve Nina Kapoor' }))
    await waitFor(() => expect(adminApi.decideVerification).toHaveBeenCalledWith('u1', 'APPROVED', undefined))
    expect(await screen.findByText(/Nina Kapoor was approved/)).toBeInTheDocument()
  })

  it('requires a reason before rejecting', async () => {
    vi.mocked(adminApi.listVerifications).mockResolvedValue(page([item()]))
    vi.mocked(adminApi.decideVerification).mockResolvedValue(item({ status: 'REJECTED' }))
    render(<Verifications />)
    await userEvent.click(await screen.findByRole('button', { name: 'Reject Nina Kapoor' }))
    const dialog = screen.getByRole('dialog')
    const submit = within(dialog).getByRole('button', { name: 'Reject' })
    expect(submit).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Not found')
    expect(submit).toBeEnabled()
    await userEvent.click(submit)
    await waitFor(() => expect(adminApi.decideVerification).toHaveBeenCalledWith('u1', 'REJECTED', 'Not found'))
  })

  it('shows an empty state and switches filters', async () => {
    vi.mocked(adminApi.listVerifications).mockResolvedValue(page([]))
    render(<Verifications />)
    expect(await screen.findByText('Nothing here')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Rejected' }))
    await waitFor(() => expect(adminApi.listVerifications).toHaveBeenLastCalledWith('REJECTED', 0))
  })

  it('shows an error alert when loading fails', async () => {
    vi.mocked(adminApi.listVerifications).mockRejectedValue(new Error('x'))
    render(<Verifications />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
