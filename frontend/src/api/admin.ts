import { api } from './client'

export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export interface VerificationItem {
  userId: string; displayName: string; email: string; specialty: string; licenseNumber: string
  licenseCountry: string; status: VerificationStatus; submittedAt: string; verifiedAt: string | null
}
export interface Page<T> { items: T[]; page: number; size: number; total: number; totalPages: number }

export async function listVerifications(status: VerificationStatus | undefined, page: number, size = 10) {
  const { data } = await api.get<Page<VerificationItem>>('/admin/verifications', { params: { status, page, size } })
  return data
}

export async function decideVerification(userId: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
  const { data } = await api.patch<VerificationItem>(`/admin/verifications/${userId}`, { decision, reason })
  return data
}
