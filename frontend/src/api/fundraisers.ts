import { api } from './client'

export type FundNeed = 'MEDICINE' | 'SURGERY' | 'TESTS' | 'TRANSPORT' | 'OTHER'
export type FundStatus = 'PENDING' | 'ACTIVE' | 'FUNDED' | 'CLOSED' | 'REJECTED'

export interface FundCard {
  id: string; communityId: string; communityName: string; caseId: string | null
  title: string; beneficiary: string; need: FundNeed
  goalAmount: number; raisedAmount: number; supporters: number; status: FundStatus
  organiserName: string; organiserDoctor: boolean; verifiedByName: string | null
  deadline: string | null; daysLeft: number | null; createdAt: string
}
export interface FundUpdate { id: string; authorName: string; kind: 'UPDATE' | 'FUNDS_USED'; body: string; createdAt: string }
export interface Supporter { name: string; amount: number; message: string | null; createdAt: string }
export interface FundDetail {
  card: FundCard; story: string; rejectReason: string | null; updates: FundUpdate[]; recent: Supporter[]
  member: boolean; organiser: boolean; canVerify: boolean; canManage: boolean; canContribute: boolean; blockedReason: string | null; myTotal: number
}
export interface FundSummary { totalRaised: number; active: number; supporters: number; fundedCount: number }
export interface NewFund {
  communityId: string; caseId?: string; title: string; story: string; beneficiary: string; need: FundNeed; goalAmount: number; deadline?: string
}

export type FundScope = 'live' | 'mine' | 'pending' | 'funded'

export const listFunds = async (scope: FundScope = 'live', communityId?: string) =>
  (await api.get<FundCard[]>('/fundraisers', { params: { scope, communityId } })).data
export const fundSummary = async () => (await api.get<FundSummary>('/fundraisers/summary')).data
export const getFund = async (id: string) => (await api.get<FundDetail>(`/fundraisers/${id}`)).data
export const createFund = async (b: NewFund) => (await api.post<FundCard>('/fundraisers', b)).data
export const verifyFund = async (id: string) => (await api.post<FundCard>(`/fundraisers/${id}/verify`)).data
export const rejectFund = async (id: string, reason: string) => (await api.post<FundCard>(`/fundraisers/${id}/reject`, { reason })).data
export const contribute = async (id: string, b: { amount: number; anonymous: boolean; message?: string }) =>
  (await api.post<FundDetail>(`/fundraisers/${id}/contribute`, b)).data
export const postFundUpdate = async (id: string, b: { body: string; kind: 'UPDATE' | 'FUNDS_USED' }) =>
  (await api.post<FundDetail>(`/fundraisers/${id}/updates`, b)).data
export const closeFund = async (id: string) => (await api.post<FundCard>(`/fundraisers/${id}/close`)).data
