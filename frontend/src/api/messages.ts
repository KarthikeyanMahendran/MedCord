import { api } from './client'

export interface Author { id: string; displayName: string; specialty: string | null; verified: boolean }
export interface ReplyPreview { id: string; authorName: string; excerpt: string | null; deleted: boolean }
export interface Message {
  id: string; channelId: string; author: Author; body: string | null; createdAt: string
  editedAt: string | null; deleted: boolean; replyTo: ReplyPreview | null
}
export interface MessagePage { items: Message[]; hasMore: boolean }
export interface Revision { revisionNo: number; kind: 'EDIT' | 'DELETE'; body: string; actorId: string; actorName: string; createdAt: string }

export const listMessages = async (channelId: string, before?: string, limit = 50) =>
  (await api.get<MessagePage>(`/channels/${channelId}/messages`, { params: { before, limit } })).data
export const sendMessage = async (channelId: string, body: string, replyToId?: string) =>
  (await api.post<Message>(`/channels/${channelId}/messages`, { body, replyToId })).data
export const editMessage = async (id: string, body: string) => (await api.patch<Message>(`/messages/${id}`, { body })).data
export const deleteMessage = async (id: string) => { await api.delete(`/messages/${id}`) }
export const messageHistory = async (id: string) => (await api.get<Revision[]>(`/messages/${id}/revisions`)).data
