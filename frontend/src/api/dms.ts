import { api } from './client'

export interface Participant { id: string; displayName: string; specialty: string | null; verified: boolean; online: boolean }
export interface Conversation {
  id: string; group: boolean; name: string; participants: Participant[]
  lastMessage: { authorName: string; excerpt: string; at: string } | null; blockedByMe: boolean; blockedByThem: boolean
}
export interface BlockedUser { id: string; displayName: string; blockedAt: string }

const dmCache = new Map<string, Conversation>()

export const getCachedDm = (id: string): Conversation | null => dmCache.get(id) ?? null

export const listDms = async (limit = 50, offset = 0) => {
  const data = (await api.get<Conversation[]>('/dms', { params: { limit, offset } })).data
  if (Array.isArray(data)) data.forEach((c) => dmCache.set(c.id, c))
  return data
}

export const getDm = async (id: string) => {
  const data = (await api.get<Conversation>(`/dms/${id}`)).data
  if (data && data.id) dmCache.set(data.id, data)
  return data
}

export const startDm = async (userIds: string[]) => {
  const data = (await api.post<Conversation>('/dms', { userIds })).data
  if (data && data.id) dmCache.set(data.id, data)
  return data
}
export const blockUser = async (id: string) => { await api.put(`/users/${id}/block`) }
export const unblockUser = async (id: string) => { await api.delete(`/users/${id}/block`) }
export const listBlocked = async () => (await api.get<BlockedUser[]>('/users/blocks')).data
export const heartbeat = async () => { await api.post('/presence/heartbeat') }
