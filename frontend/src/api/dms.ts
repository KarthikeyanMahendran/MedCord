import { api } from './client'

export interface Participant { id: string; displayName: string; specialty: string | null; verified: boolean; online: boolean }
export interface Conversation {
  id: string; group: boolean; name: string; participants: Participant[]
  lastMessage: { authorName: string; excerpt: string; at: string } | null; blockedByMe: boolean; blockedByThem: boolean
}
export interface BlockedUser { id: string; displayName: string; blockedAt: string }

export const listDms = async () => (await api.get<Conversation[]>('/dms')).data
export const getDm = async (id: string) => (await api.get<Conversation>(`/dms/${id}`)).data
export const startDm = async (userIds: string[]) => (await api.post<Conversation>('/dms', { userIds })).data
export const blockUser = async (id: string) => { await api.put(`/users/${id}/block`) }
export const unblockUser = async (id: string) => { await api.delete(`/users/${id}/block`) }
export const listBlocked = async () => (await api.get<BlockedUser[]>('/users/blocks')).data
export const heartbeat = async () => { await api.post('/presence/heartbeat') }
