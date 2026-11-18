import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThreadPanel } from './ThreadPanel'
import * as msgs from '../../api/messages'

vi.mock('../../api/messages')

const author = { id: 'u2', displayName: 'Dr Sara', specialty: null, verified: true }
const message = (o: Partial<msgs.Message> = {}): msgs.Message => ({
  id: 'm', channelId: 'ch', author, body: 'root text', createdAt: '2026-11-18T10:00:00Z', editedAt: null, deleted: false,
  replyTo: null, thread: null, threadId: null, ...o,
})
const thread = (o: Partial<msgs.Thread> = {}): msgs.Thread => ({
  id: 't1', channelId: 'ch', rootMessageId: 'm', title: 'Case 1', archived: false, replyCount: 1, lastReplyAt: null,
  createdBy: 'me', createdAt: '2026-11-18T10:00:00Z', root: message(), ...o,
})
const setup = (props: Partial<React.ComponentProps<typeof ThreadPanel>> = {}) =>
  render(<ThreadPanel threadId="t1" userId="me" canPost moderator={false} onClose={() => {}} onChanged={() => {}} {...props} />)

describe('ThreadPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(msgs.getThread).mockResolvedValue(thread())
    vi.mocked(msgs.listThreadMessages).mockResolvedValue({ hasMore: false, items: [message({ id: 'r1', threadId: 't1', body: 'first reply' })] })
  })

  it('shows the root message, replies and title', async () => {
    setup()
    expect(await screen.findByText('root text')).toBeInTheDocument()
    expect(await screen.findByText('first reply')).toBeInTheDocument()
    expect(screen.getByText('Case 1')).toBeInTheDocument()
  })

  it('posts a reply with Enter and notifies the parent', async () => {
    vi.mocked(msgs.replyInThread).mockResolvedValue(message({ id: 'r2', threadId: 't1', body: 'my reply' }))
    const onChanged = vi.fn()
    setup({ onChanged })
    await userEvent.type(await screen.findByLabelText('Reply in thread'), 'my reply{Enter}')
    await waitFor(() => expect(msgs.replyInThread).toHaveBeenCalledWith('t1', 'my reply'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('shows a read-only notice when the thread is archived and lets the creator reopen it', async () => {
    vi.mocked(msgs.getThread).mockResolvedValue(thread({ archived: true }))
    vi.mocked(msgs.updateThread).mockResolvedValue(thread({ archived: false }))
    setup()
    expect(await screen.findByText('This thread is archived.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Reply in thread')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Reopen/ }))
    await waitFor(() => expect(msgs.updateThread).toHaveBeenCalledWith('t1', { archived: false }))
  })

  it('hides archive control from users who are neither creator nor moderator', async () => {
    setup({ userId: 'someone-else' })
    await screen.findByText('Case 1')
    expect(screen.queryByRole('button', { name: /Archive/ })).toBeNull()
  })
})
