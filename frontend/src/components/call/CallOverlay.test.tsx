import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CallOverlay } from './CallOverlay'
import type { CallState } from '../../context/CallContext'
import type { CallRecord } from '../../api/calls'

const api = { accept: vi.fn(), decline: vi.fn(), hangup: vi.fn(), toggleMic: vi.fn(), toggleCam: vi.fn(), bindVideo: vi.fn(), dismiss: vi.fn(), startCall: vi.fn() }
let current: { state: CallState; error: string | null; lastEnded: string | null; ready: boolean }
vi.mock('../../context/CallContext', () => ({ useCall: () => ({ ...current, ...api }) }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))

const call = (media: 'AUDIO' | 'VIDEO' = 'VIDEO', callerIsMe = false): CallRecord => ({
  id: 'c1', channelId: 'dm', media, status: 'RINGING', createdAt: '', connectedAt: null, endedAt: null, durationSeconds: null,
  caller: callerIsMe ? { id: 'me', displayName: 'Me', providerUserId: 'me' } : { id: 'u2', displayName: 'Dr Sara', providerUserId: 'u2' },
  callee: callerIsMe ? { id: 'u2', displayName: 'Dr Sara', providerUserId: 'u2' } : { id: 'me', displayName: 'Me', providerUserId: 'me' },
})
const base: CallState = { phase: 'idle', call: null, micOn: true, camOn: true, remoteMicOn: true, remoteCamOn: true, connectedAt: null }

describe('CallOverlay', () => {
  beforeEach(() => { vi.clearAllMocks(); current = { state: base, error: null, lastEnded: null, ready: true } })

  it('renders nothing while idle', () => {
    const { container } = render(<CallOverlay />)
    expect(container).toBeEmptyDOMElement()
  })

  it('prompts for an incoming call and accepts or declines', async () => {
    current.state = { ...base, phase: 'incoming', call: call('VIDEO') }
    render(<CallOverlay />)
    expect(screen.getByRole('alertdialog', { name: 'Incoming video call from Dr Sara' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Accept call' }))
    expect(api.accept).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Decline call' }))
    expect(api.decline).toHaveBeenCalled()
  })

  it('shows a calling card that can be cancelled', async () => {
    current.state = { ...base, phase: 'outgoing', call: call('AUDIO', true) }
    render(<CallOverlay />)
    expect(screen.getByRole('region', { name: 'Call with Dr Sara' })).toHaveTextContent('Calling…')
    expect(screen.queryByRole('button', { name: /Mute microphone/ })).toBeNull()      // controls appear once connected
    await userEvent.click(screen.getByRole('button', { name: 'Cancel call' }))
    expect(api.hangup).toHaveBeenCalled()
  })

  it('in a connected video call: timer, mute, camera, hang up, and binds media', async () => {
    current.state = { ...base, phase: 'connected', call: call('VIDEO', true), connectedAt: Date.now() - 65_000 }
    render(<CallOverlay />)
    expect(screen.getByRole('region', { name: 'Call with Dr Sara' })).toHaveTextContent('1:05')
    expect(api.bindVideo).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Mute microphone' }))
    expect(api.toggleMic).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Turn camera off' }))
    expect(api.toggleCam).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Hang up' }))
    expect(api.hangup).toHaveBeenCalled()
  })

  it('voice calls have no camera control and show muted state of the other person', () => {
    current.state = { ...base, phase: 'connected', call: call('AUDIO', true), connectedAt: Date.now(), remoteMicOn: false }
    render(<CallOverlay />)
    expect(screen.queryByRole('button', { name: /camera/ })).toBeNull()
    expect(screen.getByText('Muted')).toBeInTheDocument()
  })

  it('shows the end-of-call summary and dismissible errors', async () => {
    current.lastEnded = 'Video call · 2:10'
    const { rerender } = render(<CallOverlay />)
    expect(screen.getByRole('status')).toHaveTextContent('Video call · 2:10')
    current = { ...current, lastEnded: null, error: 'Dr Sara is on another call.' }
    rerender(<CallOverlay />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(api.dismiss).toHaveBeenCalled()
  })
})
