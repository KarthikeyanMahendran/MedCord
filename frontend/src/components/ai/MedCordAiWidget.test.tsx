import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MedCordAiWidget } from './MedCordAiWidget'
import * as aiApi from '../../api/ai'

vi.mock('../../api/ai')
vi.mock('../../api/dms', () => ({ startDm: vi.fn() }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))

describe('MedCordAiWidget', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders floating launcher button and opens dialog on click', async () => {
    render(
      <MemoryRouter>
        <MedCordAiWidget />
      </MemoryRouter>
    )

    const launcher = screen.getByRole('button', { name: /Open MedCord AI Assistant/i })
    expect(launcher).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(launcher)

    expect(screen.getByRole('dialog', { name: /MedCord AI Chat/i })).toBeInTheDocument()
    expect(screen.getByText('Hello, Doctor!')).toBeInTheDocument()
    expect(screen.getByText(/AI-generated information · Verify medical information independently./i)).toBeInTheDocument()
  })

  it('submits question and renders answer with citation link', async () => {
    vi.mocked(aiApi.askMedCordAi).mockResolvedValue({
      answer: 'Doctors discussed initiating IV fluids and checking electrolyte levels before insulin.',
      citations: [
        {
          messageId: 'msg-1',
          channelId: 'ch-1',
          channelName: 'emergency',
          communityId: 'comm-1',
          communityName: 'Cardiology Network',
          authorId: 'user-1',
          authorName: 'Arun',
          timestamp: '2026-11-18T10:00:00Z',
          snippet: 'IV fluid resuscitation is the primary step.',
        },
      ],
      aiGenerated: true,
    })

    render(
      <MemoryRouter>
        <MedCordAiWidget />
      </MemoryRouter>
    )

    await userEvent.click(screen.getByRole('button', { name: /Open MedCord AI Assistant/i }))

    const input = screen.getByPlaceholderText('Ask anything about community discussions...')
    await userEvent.type(input, 'What are the emergency protocols?')

    const sendBtn = screen.getByRole('button', { name: /Send query/i })
    await userEvent.click(sendBtn)

    await waitFor(() => {
      expect(aiApi.askMedCordAi).toHaveBeenCalledWith('What are the emergency protocols?', undefined, undefined)
    })

    expect(await screen.findByText(/Doctors discussed initiating IV fluids/i)).toBeInTheDocument()
    expect(screen.getByText(/emergency · Cardiology Network/i)).toBeInTheDocument()
    expect(screen.getByText(/Dr. Arun/i)).toBeInTheDocument()
  })

  it('opens a direct message when the citation author name is clicked', async () => {
    const { startDm } = await import('../../api/dms')
    vi.mocked(startDm).mockResolvedValue({ id: 'dm-1' } as never)
    vi.mocked(aiApi.askMedCordAi).mockResolvedValue({
      answer: 'Discussion summary.',
      citations: [
        {
          messageId: 'msg-1', channelId: 'ch-1', channelName: 'emergency',
          communityId: 'comm-1', communityName: 'Cardiology Network',
          authorId: 'user-1', authorName: 'Arun',
          timestamp: '2026-11-18T10:00:00Z', snippet: 'IV fluids first.',
        },
      ],
      aiGenerated: true,
    })

    render(
      <MemoryRouter>
        <MedCordAiWidget />
      </MemoryRouter>
    )

    await userEvent.click(screen.getByRole('button', { name: /Open MedCord AI Assistant/i }))
    await userEvent.type(screen.getByPlaceholderText('Ask anything about community discussions...'), 'protocols?')
    await userEvent.click(screen.getByRole('button', { name: /Send query/i }))

    const authorBtn = await screen.findByRole('button', { name: /Message Dr. Arun/i })
    await userEvent.click(authorBtn)

    await waitFor(() => expect(startDm).toHaveBeenCalledWith(['user-1']))
  })
})
