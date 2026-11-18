import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModerationPanel } from './ModerationPanel'
import * as mod from '../../api/moderation'

vi.mock('../../api/moderation')

const report = (o: Partial<mod.Report> = {}): mod.Report => ({
  id: 'r1', status: 'OPEN', reason: 'PHI', details: 'names a patient', reporterName: 'Dr Peer', createdAt: '2026-11-18T10:00:00Z',
  messageId: 'm1', channelId: 'ch', channelName: 'general', authorId: 'u', authorName: 'Dr Member', body: 'Patient John has lupus',
  messageDeleted: false, handledByName: null, handledAt: null, ...o,
})

describe('ModerationPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(mod.listReports).mockResolvedValue([report()])
    vi.mocked(mod.listMutes).mockResolvedValue([{ userId: 'u9', displayName: 'Dr Muted', until: '2026-11-18T13:00:00Z', reason: 'spam' }])
  })

  it('lists open reports and active mutes', async () => {
    render(<ModerationPanel communityId="c" canModerate canManageMembers />)
    expect(await screen.findByText(/Patient John has lupus/)).toBeInTheDocument()
    expect(screen.getByText('Patient info')).toBeInTheDocument()
    expect(await screen.findByText('Dr Muted')).toBeInTheDocument()
    expect(mod.listReports).toHaveBeenCalledWith('c', 'OPEN')
  })

  it('deletes the message and resolves in one click', async () => {
    vi.mocked(mod.resolveReport).mockResolvedValue(report({ status: 'RESOLVED' }))
    render(<ModerationPanel communityId="c" canModerate canManageMembers={false} />)
    await userEvent.click(await screen.findByRole('button', { name: /Delete message and resolve/ }))
    await waitFor(() => expect(mod.resolveReport).toHaveBeenCalledWith('c', 'r1', 'RESOLVED', true))
  })

  it('dismisses a report and unmutes a member', async () => {
    vi.mocked(mod.resolveReport).mockResolvedValue(report({ status: 'DISMISSED' }))
    vi.mocked(mod.unmuteMember).mockResolvedValue()
    render(<ModerationPanel communityId="c" canModerate canManageMembers />)
    await userEvent.click(await screen.findByRole('button', { name: /Dismiss/ }))
    await waitFor(() => expect(mod.resolveReport).toHaveBeenCalledWith('c', 'r1', 'DISMISSED'))
    await userEvent.click(await screen.findByRole('button', { name: 'Unmute' }))
    await waitFor(() => expect(mod.unmuteMember).toHaveBeenCalledWith('c', 'u9'))
  })

  it('hides sections the user has no permission for', async () => {
    render(<ModerationPanel communityId="c" canModerate={false} canManageMembers={false} />)
    await waitFor(() => expect(screen.queryByText('Active mutes')).toBeNull())
    expect(mod.listReports).not.toHaveBeenCalled()
    expect(mod.listMutes).not.toHaveBeenCalled()
  })
})
