import { api } from './client'

export interface VoiceParticipant {
  userId: string
  displayName: string
  specialty: string | null
  verified: boolean
  micOn: boolean
  camOn: boolean
  screenSharing: boolean
  joinedAt: string
}

export interface VoiceRoom {
  channelId: string
  communityId: string
  name: string
  topic: string | null
  archived: boolean
  participants: VoiceParticipant[]
}

export const listCommunityVoiceRooms = async (communityId: string) =>
  (await api.get<VoiceRoom[]>(`/communities/${communityId}/voice-rooms`)).data

export const getVoiceRoom = async (channelId: string) =>
  (await api.get<VoiceRoom>(`/channels/${channelId}/voice`)).data

export const joinVoiceRoom = async (channelId: string, opts?: { micOn?: boolean; camOn?: boolean }) =>
  (await api.post<VoiceRoom>(`/channels/${channelId}/voice/join`, opts ?? {})).data

export const leaveVoiceRoom = async (channelId: string) => {
  await api.post(`/channels/${channelId}/voice/leave`)
}

export const updateVoiceState = async (channelId: string, state: { micOn?: boolean; camOn?: boolean; screenSharing?: boolean }) =>
  (await api.patch<VoiceRoom>(`/channels/${channelId}/voice/state`, state)).data

export const sendVoiceSignal = async (channelId: string, toUserId: string, kind: string, data: unknown) => {
  await api.post(`/channels/${channelId}/voice/signal`, { toUserId, kind, data })
}
