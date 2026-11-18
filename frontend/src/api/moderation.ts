import { api } from './client'

export type ReportReason = 'SPAM' | 'HARASSMENT' | 'PHI' | 'MISINFORMATION' | 'OTHER'
export type ReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED'
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'PHI', label: 'Contains patient information (PHI)' }, { value: 'HARASSMENT', label: 'Harassment or abuse' },
  { value: 'MISINFORMATION', label: 'Medical misinformation' }, { value: 'SPAM', label: 'Spam' }, { value: 'OTHER', label: 'Something else' },
]

export interface Report {
  id: string; status: ReportStatus; reason: ReportReason; details: string | null; reporterName: string; createdAt: string
  messageId: string; channelId: string | null; channelName: string | null; authorId: string | null; authorName: string | null
  body: string | null; messageDeleted: boolean; handledByName: string | null; handledAt: string | null
}
export interface Mute { userId: string; displayName: string; until: string; reason: string | null }
export interface AuditEntry { id: string; action: string; actorId: string; actorName: string; targetType: string | null; targetId: string | null; summary: string; createdAt: string }
export interface AuditPage { items: AuditEntry[]; page: number; size: number; total: number; totalPages: number }

export const reportMessage = async (id: string, reason: ReportReason, details?: string) => { await api.post(`/messages/${id}/report`, { reason, details }) }
export const listReports = async (communityId: string, status?: ReportStatus) =>
  (await api.get<Report[]>(`/communities/${communityId}/reports`, { params: { status } })).data
export const resolveReport = async (communityId: string, reportId: string, status: 'RESOLVED' | 'DISMISSED', deleteMessage = false) =>
  (await api.patch<Report>(`/communities/${communityId}/reports/${reportId}`, { status, deleteMessage })).data
export const muteMember = async (communityId: string, userId: string, minutes: number, reason?: string) =>
  (await api.put<Mute>(`/communities/${communityId}/members/${userId}/mute`, { minutes, reason })).data
export const unmuteMember = async (communityId: string, userId: string) => { await api.delete(`/communities/${communityId}/members/${userId}/mute`) }
export const listMutes = async (communityId: string) => (await api.get<Mute[]>(`/communities/${communityId}/mutes`)).data
export const listAudit = async (communityId: string, page: number, action?: string) =>
  (await api.get<AuditPage>(`/communities/${communityId}/audit`, { params: { page, size: 15, action: action || undefined } })).data
