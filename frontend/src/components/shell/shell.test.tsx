import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerRail } from './ServerRail'
import { SideColumn } from './SideColumn'
import { Avatar, colorFor, initialsOf } from '../ui'
import * as comm from '../../api/communities'
import * as dms from '../../api/dms'

vi.mock('../../api/communities')
vi.mock('../../api/dms')
let role: 'ADMIN' | 'USER' = 'USER'
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', displayName: 'Dr. Priya Raman', specialty: 'Cardiology', email: 'p@x.dev', platformRole: role }, signOut: vi.fn() }),
}))
vi.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark', toggle: vi.fn() }) }))

const community = (o: Partial<comm.Community> = {}): comm.Community => ({
  id: 'c1', name: 'Cardiology Collective', slug: 'cc', description: null, specialtyTag: null, visibility: 'PUBLIC', ownerId: 'o', memberCount: 5, myPermissions: ['SEND_MESSAGES'], ...o,
})
const ch = (o: Partial<comm.Channel>): comm.Channel => ({ id: 'x', name: 'general', topic: null, type: 'TEXT', position: 0, archived: false, ...o })

describe('Avatar helpers', () => {
  it('derives stable initials and colour per name', () => {
    expect(initialsOf('Dr. Priya Raman')).toBe('PR')
    expect(initialsOf('Nina Kapoor, RN')).toBe('NK')
    expect(colorFor('Cardio')).toBe(colorFor('Cardio'))
    expect(colorFor('Cardio')).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('renders initials hidden from assistive tech', () => {
    const { container } = render(<Avatar name="Sara Ahmed" size="sm" />)
    expect(container.textContent).toBe('SA')
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('ServerRail', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    role = 'USER'
    vi.mocked(comm.listMine).mockResolvedValue([community(), community({ id: 'c2', name: 'Emergency Hub' })])
  })

  it('shows home, DMs and one icon per community with links', async () => {
    render(<MemoryRouter><ServerRail /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute('href', '/messages')
    const c = await screen.findByRole('link', { name: 'Cardiology Collective' })
    expect(c).toHaveAttribute('href', '/communities/c1')
    expect(c).toHaveTextContent('CC')
    expect(screen.getByRole('link', { name: 'Emergency Hub' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Verify doctors' })).toBeNull()
  })

  it('shows the verification shortcut only to platform admins', async () => {
    role = 'ADMIN'
    render(<MemoryRouter><ServerRail /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: 'Verify doctors' })).toHaveAttribute('href', '/admin/verifications')
  })

  it('marks the active community', async () => {
    render(<MemoryRouter initialEntries={['/communities/c1']}><ServerRail /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: 'Cardiology Collective' })
    expect(link.className).toContain('is-active')
  })
})

describe('SideColumn', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    role = 'USER'
    vi.mocked(comm.getCommunity).mockResolvedValue(community())
    vi.mocked(comm.listChannels).mockResolvedValue([ch({ id: 'a', name: 'announcements', type: 'ANNOUNCEMENT' }), ch({ id: 'g', name: 'general' }), ch({ id: 'z', name: 'old', archived: true })])
    vi.mocked(dms.listDms).mockResolvedValue([{ id: 'dm1', group: false, name: 'Dr Sara', blockedByMe: false, blockedByThem: false,
      lastMessage: { authorName: 'Dr Sara', excerpt: 'See you Thursday', at: '2026-11-18T10:00:00Z' },
      participants: [{ id: 'me', displayName: 'Me', specialty: null, verified: false, online: true }, { id: 'u2', displayName: 'Dr Sara', specialty: null, verified: true, online: true }] }])
  })

  const at = (path: string) => render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="*" element={<SideColumn />} /></Routes>
    </MemoryRouter>,
  )

  it('lists channels grouped by type inside a community, with the active one marked', async () => {
    at('/communities/c1/channels/g')
    expect(await screen.findByText('Cardiology Collective')).toBeInTheDocument()
    expect(screen.getByText('Announcements')).toBeInTheDocument()
    expect(screen.getByText('Text channels')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /general/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /announcements/ })).toHaveAttribute('href', '/communities/c1/channels/a')
    expect(screen.getByText('archived')).toBeInTheDocument()
  })

  it('lists direct messages with a last-message preview', async () => {
    at('/messages/dm1')
    expect(await screen.findByText('See you Thursday')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Dr Sara/ })).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(dms.listDms).toHaveBeenCalled())
  })

  it('shows plain navigation elsewhere, plus admin links only for admins', async () => {
    at('/')
    expect(screen.getByRole('link', { name: /Communities/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Overview/ })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('link', { name: /Verifications/ })).toBeNull()
  })

  it('always shows the signed-in user panel', async () => {
    at('/')
    expect(screen.getByText('Dr. Priya Raman')).toBeInTheDocument()
    expect(screen.getByText('Cardiology')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Switch to (light|dark) theme/ })).toBeInTheDocument()
  })
})
