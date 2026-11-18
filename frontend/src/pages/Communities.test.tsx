import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Communities from './Communities'
import * as api from '../api/communities'

vi.mock('../api/communities')
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u', status: 'ACTIVE', verificationStatus: 'APPROVED' } }) }))

const comm = (o: Partial<api.Community> = {}): api.Community => ({
  id: 'c1', name: 'Cardio Club', slug: 'cardio-club', description: 'Hearts', specialtyTag: 'Cardiology',
  visibility: 'PUBLIC', ownerId: 'o', memberCount: 5, myPermissions: [], ...o,
})
const setup = () => render(<MemoryRouter><Communities /></MemoryRouter>)

describe('Communities page', () => {
  beforeEach(() => vi.resetAllMocks())

  it('shows my communities and joinable discoveries', async () => {
    vi.mocked(api.listMine).mockResolvedValue([comm({ id: 'm1', name: 'Mine One', myPermissions: ['SEND_MESSAGES'] })])
    vi.mocked(api.discover).mockResolvedValue([comm({ id: 'm1', name: 'Mine One' }), comm({ id: 'd1', name: 'Open Forum' })])
    vi.mocked(api.joinCommunity).mockResolvedValue(comm())
    setup()
    expect(await screen.findByText('Mine One')).toBeInTheDocument()
    expect(await screen.findByText('Open Forum')).toBeInTheDocument()
    expect(screen.getAllByText('Mine One')).toHaveLength(1) // not repeated under Discover
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    await waitFor(() => expect(api.joinCommunity).toHaveBeenCalledWith('d1'))
  })

  it('creates a community from the modal', async () => {
    vi.mocked(api.listMine).mockResolvedValue([])
    vi.mocked(api.discover).mockResolvedValue([])
    vi.mocked(api.createCommunity).mockResolvedValue(comm())
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /New community/ }))
    await userEvent.type(screen.getByLabelText('Name'), 'Neuro Hub')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(api.createCommunity).toHaveBeenCalledWith(expect.objectContaining({ name: 'Neuro Hub', visibility: 'PUBLIC' })))
  })

  it('shows an empty state when there is nothing to show', async () => {
    vi.mocked(api.listMine).mockResolvedValue([])
    vi.mocked(api.discover).mockResolvedValue([])
    setup()
    expect(await screen.findByText("You haven't joined any communities yet")).toBeInTheDocument()
  })
})
