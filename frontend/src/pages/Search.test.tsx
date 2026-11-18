import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Search from './Search'
import * as searchApi from '../api/search'
import * as comm from '../api/communities'
import { Highlight } from '../components/chat/Highlight'

vi.mock('../api/search')
vi.mock('../api/communities')

const hit = (o: Partial<searchApi.Hit> = {}): searchApi.Hit => ({
  messageId: 'm1', channelId: 'ch', channelName: 'general', dm: false, communityId: 'c1', communityName: 'Cardio Club',
  authorId: 'u', authorName: 'Dr Sara', snippet: 'review the stent plan', createdAt: '2026-11-18T10:00:00Z', threadId: null, ...o,
})
const setup = () => render(<MemoryRouter><Search /></MemoryRouter>)

describe('Search page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(comm.listMine).mockResolvedValue([])
  })

  it('asks for at least 2 characters before searching', async () => {
    setup()
    expect(screen.getByText('Type at least 2 characters to search')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Search messages'), 's')
    expect(searchApi.search).not.toHaveBeenCalled()
  })

  it('shows highlighted results with a link to the channel', async () => {
    vi.mocked(searchApi.search).mockResolvedValue({ items: [hit()], limit: 20, offset: 0, hasMore: false })
    setup()
    await userEvent.type(screen.getByLabelText('Search messages'), 'stent')
    expect(await screen.findByText('stent', { selector: 'mark' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /general · Cardio Club/ })).toHaveAttribute('href', '/communities/c1/channels/ch')
    expect(searchApi.search).toHaveBeenCalledWith('stent', { communityId: undefined })
  })

  it('links DM hits to the conversation, shows empty state and loads more', async () => {
    vi.mocked(searchApi.search)
      .mockResolvedValueOnce({ items: [hit({ dm: true, communityId: null, communityName: null })], limit: 1, offset: 0, hasMore: true })
      .mockResolvedValueOnce({ items: [hit({ messageId: 'm2' })], limit: 1, offset: 1, hasMore: false })
    setup()
    await userEvent.type(screen.getByLabelText('Search messages'), 'plan')
    expect(await screen.findByRole('link', { name: /Direct message/ })).toHaveAttribute('href', '/messages/ch')
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(searchApi.search).toHaveBeenLastCalledWith('plan', { communityId: undefined, offset: 1 }))
    expect(await screen.findAllByRole('link', { name: /general|Direct message/ })).toHaveLength(2)
  })

  it('shows a no-results message', async () => {
    vi.mocked(searchApi.search).mockResolvedValue({ items: [], limit: 20, offset: 0, hasMore: false })
    setup()
    await userEvent.type(screen.getByLabelText('Search messages'), 'zzzz')
    expect(await screen.findByText('No messages found')).toBeInTheDocument()
  })
})

describe('Highlight', () => {
  it('renders markup-looking text as plain text, never as HTML', () => {
    const { container } = render(<Highlight text={'<img src=x onerror=alert(1)> hit'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(container.querySelector('mark')?.textContent).toBe('hit')
  })
})
