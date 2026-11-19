import { api } from './client'

export type PhiMode = 'OFF' | 'WARN' | 'STRICT_BLOCK'

export interface BlockedTerm {
  id: string
  term: string
  syncedToNexconn: boolean
  createdAt: string
}

export interface SafetyPolicy {
  communityId: string
  phiMode: PhiMode
  autoRedact: boolean
  nexconnModerationEnabled: boolean
  blockedTerms: BlockedTerm[]
}

export interface PhiScanResponse {
  hasPhi: boolean
  effectiveMode: PhiMode
  autoRedactPolicy: boolean
  categories: string[]
  redactedText: string
}

export const getSafetyPolicy = async (communityId: string) =>
  (await api.get<SafetyPolicy>(`/communities/${communityId}/safety`)).data

export const updateSafetyPolicy = async (communityId: string, body: { phiMode: PhiMode; autoRedact: boolean }) =>
  (await api.put<SafetyPolicy>(`/communities/${communityId}/safety`, body)).data

export const addBlockedTerm = async (communityId: string, term: string) =>
  (await api.post<BlockedTerm>(`/communities/${communityId}/safety/terms`, { term })).data

export const removeBlockedTerm = async (communityId: string, termId: string) => {
  await api.delete(`/communities/${communityId}/safety/terms/${termId}`)
}

export const scanChannelPhi = async (channelId: string, body: string) =>
  (await api.post<PhiScanResponse>(`/channels/${channelId}/phi-scan`, { body })).data
