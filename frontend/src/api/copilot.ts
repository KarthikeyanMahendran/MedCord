import { api } from './client'
import type { Message } from './messages'

export type CopilotMode = 'SUMMARIZE' | 'HANDOFF' | 'DIFFERENTIAL' | 'ASK'

export interface CopilotResponse {
  streamId: string
  message: Message
  nexconnStreamEnabled: boolean
}

export const invokeCopilot = async (
  channelId: string,
  req: { mode: CopilotMode; prompt?: string; threadId?: string },
) => (await api.post<CopilotResponse>(`/channels/${channelId}/copilot`, req)).data
