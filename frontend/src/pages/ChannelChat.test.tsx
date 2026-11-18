import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChannelChat from './ChannelChat'
import * as comm from '../api/communities'
import * as msgs from '../api/messages'
import * as dms from '../api/dms'

vi.mock('../api/communities')
vi.mock('../api/messages')
vi.mock('../api/dms')
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }))

const community = (perms: comm.Permission[]): comm.Community => ({
  id: 'c', name: 'Cardio', slug: 'cardio', description: null, specialtyTag: null, visibility: 'PUBLIC', ownerId: 'o', memberCount: 2, myPermissions: perms,
})
const channel = (o: Partial<comm.Channel> = {}): comm.Channel => ({ id: 'ch', name: 'general', topic: 'Chat', type: 'TEXT', position: 0, archived: false, ...o })
const message = (o: Partial<msgs.Message> = {}): msgs.Message => ({
  id: 'm1', channelId: 'ch', author: { id: 'u2', displayName: 'Dr Sara', specialty: 'Pediatrics', verified: true },
  body: 'Hello team', createdAt: '2026-11-18T10:00:00Z', editedAt: null, deleted: false, replyTo: null, thread: null, threadId: null, reactions: [], pinned: false, ...o,
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

  it('shows a reply-count chip and opens the thread panel', async () => {
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [message({ thread: { id: 't1', title: null, replyCount: 3, lastReplyAt: '2026-11-18T11:00:00Z', archived: false } })] })
    vi.mocked(msgs.getThread).mockResolvedValue({ id: 't1', channelId: 'ch', rootMessageId: 'm1', title: null, archived: false, replyCount: 3, lastReplyAt: null, createdBy: 'o', createdAt: '2026-11-18T10:00:00Z', root: message() })
    vi.mocked(msgs.listThreadMessages).mockResolvedValue({ hasMore: false, items: [] })
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /Open thread, 3 replies/ }))
    expect(await screen.findByLabelText('Reply in thread')).toBeInTheDocument()
    expect(msgs.getThread).toHaveBeenCalledWith('t1')
  })

  it('starts a thread from a message', async () => {
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [message()] })
    vi.mocked(msgs.startThread).mockResolvedValue({ id: 'tNew', channelId: 'ch', rootMessageId: 'm1', title: null, archived: false, replyCount: 0, lastReplyAt: null, createdBy: 'me', createdAt: '2026-11-18T10:00:00Z', root: message() })
    vi.mocked(msgs.getThread).mockResolvedValue({ id: 'tNew', channelId: 'ch', rootMessageId: 'm1', title: null, archived: false, replyCount: 0, lastReplyAt: null, createdBy: 'me', createdAt: '2026-11-18T10:00:00Z', root: message() })
    vi.mocked(msgs.listThreadMessages).mockResolvedValue({ hasMore: false, items: [] })
    setup()
    await screen.findByText('Hello team')
    await userEvent.click(screen.getByRole('button', { name: 'Start thread' }))
    await waitFor(() => expect(msgs.startThread).toHaveBeenCalledWith('m1'))
    expect(await screen.findByLabelText('Reply in thread')).toBeInTheDocument()
  })

  it('toggles a reaction chip and adds one from the picker', async () => {
    const withReaction = message({ reactions: [{ emoji: '👍', count: 2, mine: false }] })
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [withReaction] })
    vi.mocked(msgs.react).mockResolvedValue({ ...withReaction, reactions: [{ emoji: '👍', count: 3, mine: true }] })
    vi.mocked(msgs.unreact).mockResolvedValue({ ...withReaction, reactions: [{ emoji: '👍', count: 2, mine: false }] })
    setup()
    const chip = await screen.findByRole('button', { name: /👍 2 reactions/ })
    await userEvent.click(chip)
    await waitFor(() => expect(msgs.react).toHaveBeenCalledWith('m1', '👍'))
    const mineChip = await screen.findByRole('button', { name: /👍 3 reactions, including yours/ })
    expect(mineChip).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(mineChip)
    await waitFor(() => expect(msgs.unreact).toHaveBeenCalledWith('m1', '👍'))
    await userEvent.click(screen.getByRole('button', { name: 'Add reaction' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'React with 🎉' }))
    await waitFor(() => expect(msgs.react).toHaveBeenCalledWith('m1', '🎉'))
  })

  it('only moderators see the pin action, and the pinned list opens', async () => {
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [message({ pinned: true })] })
    vi.mocked(msgs.listPins).mockResolvedValue([message({ pinned: true, body: 'Channel rules' })])
    setup()
    await screen.findByText('Hello team')
    expect(screen.queryByRole('button', { name: /Pin message|Unpin message/ })).toBeNull() // not a moderator
    expect(screen.getByText('pinned')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Pinned/ }))
    expect(await screen.findByText('Channel rules')).toBeInTheDocument()
  })

  it('moderators can pin a message', async () => {
    vi.mocked(comm.getCommunity).mockResolvedValue(community(['SEND_MESSAGES', 'MODERATE_MESSAGES']))
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [message()] })
    vi.mocked(msgs.pinMessage).mockResolvedValue(message({ pinned: true }))
    setup()
    await screen.findByText('Hello team')
    await userEvent.click(screen.getByRole('button', { name: 'Pin message' }))
    await waitFor(() => expect(msgs.pinMessage).toHaveBeenCalledWith('m1'))
    expect(await screen.findByText('pinned')).toBeInTheDocument()
  })

  it('shows an error when sending fails', async () => {
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [] })
    vi.mocked(msgs.sendMessage).mockRejectedValue(new Error('x'))
    setup()
    await userEvent.type(await screen.findByLabelText('Message'), 'oops{Enter}')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('ChannelChat in DM mode', () => {
  const conv = (o: Partial<dms.Conversation> = {}): dms.Conversation => ({
    id: 'dm1', group: false, name: 'Dr Sara', blockedByMe: false, blockedByThem: false, lastMessage: null,
    participants: [{ id: 'me', displayName: 'Me', specialty: null, verified: false, online: true }, { id: 'u2', displayName: 'Dr Sara', specialty: 'Pediatrics', verified: true, online: true }], ...o,
  })
  const setupDm = (path = '/messages/dm1') => render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/messages" element={<ChannelChat />} /><Route path="/messages/:channelId" element={<ChannelChat />} /></Routes>
    </MemoryRouter>,
  )

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(dms.listDms).mockResolvedValue([conv()])
    vi.mocked(dms.getDm).mockResolvedValue(conv())
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [] })
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('lists conversations, shows the person and sends a message', async () => {
    vi.mocked(msgs.sendMessage).mockResolvedValue(message({ id: 'n1', body: 'hi sara' }))
    setupDm()
    expect(await screen.findByRole('heading', { name: 'Direct messages' })).toBeInTheDocument()
    expect((await screen.findAllByText('Dr Sara')).length).toBeGreaterThan(0)
    await userEvent.type(await screen.findByLabelText('Message'), 'hi sara{Enter}')
    await waitFor(() => expect(msgs.sendMessage).toHaveBeenCalledWith('dm1', 'hi sara', undefined))
  })

  it('blocks the other person from the header', async () => {
    vi.mocked(dms.blockUser).mockResolvedValue()
    vi.mocked(dms.getDm).mockResolvedValueOnce(conv()).mockResolvedValueOnce(conv({ blockedByMe: true }))
    setupDm()
    await userEvent.click(await screen.findByRole('button', { name: /Block/ }))
    await waitFor(() => expect(dms.blockUser).toHaveBeenCalledWith('u2'))
    expect(await screen.findByText(/You blocked this person/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Unblock/ })).toBeInTheDocument()
  })

  it('shows a placeholder when no conversation is selected', async () => {
    setupDm('/messages')
    expect(await screen.findByText('Select a conversation')).toBeInTheDocument()
    expect(msgs.listMessages).not.toHaveBeenCalled()
  })
})

