import { api } from './client'

export interface AiCitation {
  messageId: string | null
  channelId: string
  channelName: string
  communityId: string
  communityName: string
  authorId: string
  authorName: string
  timestamp: string
  snippet: string
}

export interface AiQueryResponse {
  answer: string
  citations: AiCitation[]
  aiGenerated: boolean
}

export interface AiIngestResponse {
  totalChunksCreated: number
  totalMessagesProcessed: number
  status: string
}

export async function askMedCordAi(
  question: string,
  communityId?: string,
  channelId?: string
): Promise<AiQueryResponse> {
  const { data } = await api.post<AiQueryResponse>('/ai/query', {
    question,
    communityId: communityId || undefined,
    channelId: channelId || undefined,
  })
  return data
}

export async function ingestCommunityAi(communityId?: string): Promise<AiIngestResponse> {
  const { data } = await api.post<AiIngestResponse>(
    '/ai/ingest',
    null,
    { params: communityId ? { communityId } : undefined }
  )
  return data
}
