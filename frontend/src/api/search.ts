import { api } from './client'

export interface Hit {
  messageId: string; channelId: string; channelName: string; dm: boolean; communityId: string | null; communityName: string | null
  authorId: string; authorName: string; snippet: string; createdAt: string; threadId: string | null
}
export interface SearchPage { items: Hit[]; limit: number; offset: number; hasMore: boolean }

export const search = async (q: string, opts: { communityId?: string; offset?: number; limit?: number } = {}) =>
  (await api.get<SearchPage>('/search', { params: { q, ...opts } })).data
