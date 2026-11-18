import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChannelChat from './ChannelChat'
import * as comm from '../api/communities'
import * as msgs from '../api/messages'

vi.mock('../api/communities')
vi.mock('../api/messages')
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }))

const community = (perms: comm.Permission[]): comm.Community => ({
  id: 'c', name: 'Cardio', slug: 'cardio', description: null, specialtyTag: null, visibility: 'PUBLIC', ownerId: 'o', memberCount: 2, myPermissions: perms,
})
const channel = (o: Partial<comm.Channel> = {}): comm.Channel => ({ id: 'ch', name: 'general', topic: 'Chat', type: 'TEXT', position: 0, archived: false, ...o })
const message = (o: Partial<msgs.Message> = {}): msgs.Message => ({
  id: 'm1', channelId: 'ch', author: { id: 'u2', displayName: 'Dr Sara', specialty: 'Pediatrics', verified: true },
  body: 'Hello team', createdAt: '2026-11-18T10:00:00Z', editedAt: null, deleted: false, replyTo: null, ...o,
})
const setup = () => render(
  <MemoryRouter initialEntries={['/communities/c/channels/ch']}>
    <Routes><Route path="/communities/:id/channels/:channelId" element={<ChannelChat />} /></Routes>
  </MemoryRouter>,
)

describe('ChannelChat', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(comm.getCommunity).mockResolvedValue(community(['SEND_MESSAGES']))
    vi.mocked(comm.listChannels).mockResolvedValue([channel()])
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('renders history with verified badge, edited marker and deleted placeholder', async () => {
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [
      message(), message({ id: 'm2', body: 'v2', editedAt: '2026-11-18T10:05:00Z' }), message({ id: 'm3', deleted: true, body: null }),
    ] })
    setup()
    expect(await screen.findByText('Hello team')).toBeInTheDocument()
    expect(screen.getAllByText('verified').length).toBeGreaterThan(0)
    expect(screen.getByText('(edited)')).toBeInTheDocument()
    expect(screen.getByText('This message was deleted.')).toBeInTheDocument()
  })

  it('sends a message with Enter and clears the composer', async () => {
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [] })
    vi.mocked(msgs.sendMessage).mockResolvedValue(message({ id: 'n1', body: 'Hi all', author: { id: 'me', displayName: 'Me', specialty: null, verified: false } }))
    setup()
    const box = await screen.findByLabelText('Message')
    await userEvent.type(box, 'Hi all{Enter}')
    await waitFor(() => expect(msgs.sendMessage).toHaveBeenCalledWith('ch', 'Hi all', undefined))
    expect(await screen.findByText('Hi all')).toBeInTheDocument()
    expect(box).toHaveValue('')
  })

  it('replies to a message', async () => {
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [message()] })
    vi.mocked(msgs.sendMessage).mockResolvedValue(message({ id: 'n2', body: 'agreed' }))
    setup()
    await screen.findByText('Hello team')
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }))
    expect(screen.getByText(/Replying to/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Message'), 'agreed{Enter}')
    await waitFor(() => expect(msgs.sendMessage).toHaveBeenCalledWith('ch', 'agreed', 'm1'))
  })

  it('edits own message and saves via PATCH', async () => {
    const mine = message({ id: 'mine', body: 'typo', author: { id: 'me', displayName: 'Me', specialty: null, verified: false } })
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [mine] })
    vi.mocked(msgs.editMessage).mockResolvedValue({ ...mine, body: 'fixed', editedAt: '2026-11-18T10:10:00Z' })
    setup()
    await screen.findByText('typo')
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const box = screen.getByLabelText('Message')
    expect(box).toHaveValue('typo')
    await userEvent.clear(box)
    await userEvent.type(box, 'fixed{Enter}')
    await waitFor(() => expect(msgs.editMessage).toHaveBeenCalledWith('mine', 'fixed'))
    expect(await screen.findByText('(edited)')).toBeInTheDocument()
  })

  it('ArrowUp in an empty composer edits your last message', async () => {
    const mine = message({ id: 'mine', body: 'last one', author: { id: 'me', displayName: 'Me', specialty: null, verified: false } })
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [mine] })
    setup()
    await screen.findByText('last one')
    await userEvent.type(screen.getByLabelText('Message'), '{ArrowUp}')
    expect(screen.getByLabelText('Message')).toHaveValue('last one')
    expect(screen.getByText(/Editing message/)).toBeInTheDocument()
  })

  it('disables the composer in archived and announcement-restricted channels', async () => {
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [] })
    vi.mocked(comm.listChannels).mockResolvedValue([channel({ archived: true })])
    setup()
    expect(await screen.findByText('This channel is archived and read-only.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Message')).toBeNull()
  })

  it('shows an error when sending fails', async () => {
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [] })
    vi.mocked(msgs.sendMessage).mockRejectedValue(new Error('x'))
    setup()
    await userEvent.type(await screen.findByLabelText('Message'), 'oops{Enter}')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
