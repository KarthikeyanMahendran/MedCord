import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChannelChat from '../../pages/ChannelChat'
import { AttachmentList } from './AttachmentView'
import * as comm from '../../api/communities'
import * as msgs from '../../api/messages'
import * as copilot from '../../api/copilot'
import * as safety from '../../api/safety'

vi.mock('../../api/communities')
vi.mock('../../api/messages')
vi.mock('../../api/copilot')
vi.mock('../../api/safety')
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Dr Me' } }) }))

const community: comm.Community = {
  id: 'c1', name: 'Cardio ICU', slug: 'cardio-icu', description: null, specialtyTag: 'Cardiology',
  visibility: 'PUBLIC', ownerId: 'me', memberCount: 2, myPermissions: ['SEND_MESSAGES', 'MODERATE_MESSAGES'],
}
const channel: comm.Channel = { id: 'ch1', name: 'rounds', topic: 'ICU cases', type: 'TEXT', position: 0, archived: false }

const mountChat = () => render(
  <MemoryRouter initialEntries={['/communities/c1/channels/ch1']}>
    <Routes><Route path="/communities/:id/channels/:channelId" element={<ChannelChat />} /></Routes>
  </MemoryRouter>,
)

describe('Clinical differentiators (#1 Co-Pilot, #2 Voice STT, #9 PHI Shield)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(comm.getCommunity).mockResolvedValue(community)
    vi.mocked(comm.listChannels).mockResolvedValue([channel])
    vi.mocked(comm.listMembers).mockResolvedValue([])
    vi.mocked(comm.listRoles).mockResolvedValue([])
    vi.mocked(msgs.listMessages).mockResolvedValue({ hasMore: false, items: [] })
    vi.mocked(safety.getSafetyPolicy).mockResolvedValue({
      communityId: 'c1', phiMode: 'WARN', autoRedact: false, nexconnModerationEnabled: false, blockedTerms: [],
    })
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('detects PHI live in composer and redacts + sends in one click', async () => {
    vi.mocked(msgs.sendMessage).mockResolvedValue({
      id: 'm-clean', channelId: 'ch1', author: { id: 'me', displayName: 'Dr Me', specialty: 'Cardiology', verified: true },
      body: 'Patient: [NAME REDACTED] [MRN REDACTED] stable', createdAt: '2026-11-18T10:00:00Z',
      editedAt: null, deleted: false, replyTo: null, thread: null, threadId: null, reactions: [], pinned: false, kind: 'TEXT',
    })

    mountChat()
    const box = await screen.findByLabelText('Message')
    await userEvent.type(box, 'Patient: John Doe MRN 482910 stable')

    expect(await screen.findByLabelText('PHI leak warning')).toBeInTheDocument()
    expect(screen.getByText('MRN / Patient ID')).toBeInTheDocument()
    expect(screen.getByText('Patient Name')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Redact & Send/i }))
    await waitFor(() => expect(msgs.sendMessage).toHaveBeenCalledWith(
      'ch1',
      'Patient: [NAME REDACTED] [MRN REDACTED] stable',
      undefined,
      undefined,
      true,
    ))
  })

  it('summons Clinical Co-Pilot via @ai in chat and renders AI Stream message card', async () => {
    vi.mocked(msgs.sendMessage).mockResolvedValue({
      id: 'm-user-ai', channelId: 'ch1', author: { id: 'me', displayName: 'Dr Me', specialty: 'Cardiology', verified: true },
      body: '@ai summarize', createdAt: '2026-11-18T10:00:00Z', editedAt: null, deleted: false, replyTo: null,
      thread: null, threadId: null, reactions: [], pinned: false, kind: 'TEXT',
    })
    vi.mocked(copilot.invokeCopilot).mockResolvedValue({
      streamId: 'mc-stream-1',
      nexconnStreamEnabled: true,
      message: {
        id: 'ai-1', channelId: 'ch1', author: { id: 'me', displayName: 'Dr Me', specialty: 'Cardiology', verified: true },
        body: '### Clinical Case Summary\n\n- Acute chest pain workup', createdAt: '2026-11-18T10:01:00Z',
        editedAt: null, deleted: false, replyTo: null, thread: null, threadId: null, reactions: [], pinned: false, kind: 'AI',
      },
    })

    mountChat()
    const textarea = await screen.findByRole('textbox', { name: 'Message' })
    await userEvent.type(textarea, '@ai summarize{enter}')

    await waitFor(() => expect(copilot.invokeCopilot).toHaveBeenCalledWith('ch1', { mode: 'SUMMARIZE', prompt: undefined }))
    expect(await screen.findByText('MedCord Clinical Co-Pilot')).toBeInTheDocument()
    expect(screen.getByText('AI Stream')).toBeInTheDocument()
    expect(screen.getByText(/Acute chest pain workup/)).toBeInTheDocument()
  })

  it('renders HD Voice Note attachment and transcribes on demand', async () => {
    vi.mocked(msgs.fetchAttachmentBlob).mockResolvedValue(new Blob(['OggS'], { type: 'audio/ogg' }))
    vi.mocked(msgs.transcribeAttachment).mockResolvedValue({
      id: 'att-v1', filename: 'consult.ogg', contentType: 'audio/ogg', sizeBytes: 4096,
      width: null, height: null, exifStripped: false, url: '/api/v1/attachments/att-v1',
      durationSeconds: 12, transcript: 'BP 138/84, troponin trending down.', transcriptStatus: 'COMPLETED',
    })
    URL.createObjectURL = vi.fn(() => 'blob:voice-note')
    URL.revokeObjectURL = vi.fn()

    render(
      <AttachmentList attachments={[{
        id: 'att-v1', filename: 'consult.ogg', contentType: 'audio/ogg', sizeBytes: 4096,
        width: null, height: null, exifStripped: false, url: '/api/v1/attachments/att-v1',
        durationSeconds: 12, transcript: null, transcriptStatus: 'NONE',
      }]} />,
    )

    expect(screen.getByText('HD Voice Note')).toBeInTheDocument()
    expect(screen.getByText('0:12')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Transcribe voice note' }))
    await waitFor(() => expect(msgs.transcribeAttachment).toHaveBeenCalledWith('att-v1'))
    expect(await screen.findByText('BP 138/84, troponin trending down.')).toBeInTheDocument()
  })
})
