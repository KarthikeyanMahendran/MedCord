import { api } from './client'

export type CallMedia = 'AUDIO' | 'VIDEO'
export type CallStatus = 'RINGING' | 'CONNECTED' | 'ENDED' | 'MISSED' | 'DECLINED' | 'CANCELLED' | 'FAILED'
export interface CallParty { id: string; displayName: string; providerUserId: string }
export interface CallRecord {
  id: string; channelId: string; media: CallMedia; status: CallStatus; caller: CallParty; callee: CallParty
  createdAt: string; connectedAt: string | null; endedAt: string | null; durationSeconds: number | null
}
export interface ChatToken { appKey: string; userId: string; token: string }

export const getChatToken = async () => (await api.get<ChatToken>('/chat/token')).data
export const createCall = async (channelId: string, media: CallMedia) => (await api.post<CallRecord>('/calls', { channelId, media })).data
export const getCall = async (id: string) => (await api.get<CallRecord>(`/calls/${id}`)).data
export const attachCall = async (id: string, providerCallId: string) => (await api.post<CallRecord>(`/calls/${id}/attach`, { providerCallId })).data
export const markConnected = async (id: string) => (await api.post<CallRecord>(`/calls/${id}/connected`)).data
export const endCallRecord = async (id: string, outcome: CallStatus) => (await api.post<CallRecord>(`/calls/${id}/end`, { outcome })).data
