import { api } from './client'

export type Urgency = 'GREEN' | 'AMBER' | 'RED'
export type CaseStatus = 'OPEN' | 'ASSIGNED' | 'IN_CONSULT' | 'RESOLVED' | 'CLOSED'

export interface RedFlag { code: string; label: string; advice: string }
export interface Sbar { situation?: string; background?: string; assessment?: string; recommendation?: string }

export interface CaseRoom {
  id: string; channelId: string; reporterId: string; reporterName: string
  assignedDoctorId: string | null; assignedDoctorName: string | null
  village: string | null; patientAge: number | null; patientSex: string | null
  chiefComplaint: string; vitals: Record<string, number>; sbar: Sbar | null
  urgency: Urgency; redFlags: RedFlag[]; specialtyNeeded: string; status: CaseStatus
  escalationLevel: number; createdAt: string; acceptedAt: string | null; resolvedAt: string | null
}

export interface LibraryHit { id: string; specialty: string; questionSummary: string; answer: string; helpfulCount: number; verifiedAt: string }
export interface SubmitResult { caseRoom: CaseRoom; similarAnswers: LibraryHit[] }

export interface SubmitCase {
  chiefComplaint: string; patientAge?: number; patientSex?: string; village?: string
  language?: string; vitals?: Record<string, number>
}

export interface AppNotification { id: string; kind: string; caseId: string | null; fundraiserId?: string | null; title: string; body: string | null; read: boolean; createdAt: string }

export interface Impact {
  totalCases: number; resolved: number; redCases: number; open: number; avgMinutesToAccept: number | null
  byRegion: { name: string; district: string; state: string; cases: number; red_cases: number; open_cases: number }[]
  daily: { day: string; cases: number; red_cases: number; resolved: number }[]
}

export const submitCase = async (c: SubmitCase) => (await api.post<SubmitResult>('/cases', c)).data
export const myCases = async () => (await api.get<CaseRoom[]>('/cases/mine')).data
export const caseQueue = async () => (await api.get<CaseRoom[]>('/cases/queue')).data
export const getCase = async (id: string) => (await api.get<CaseRoom>(`/cases/${id}`)).data
export const acceptCase = async (id: string) => (await api.post<CaseRoom>(`/cases/${id}/accept`)).data
export const answerCase = async (id: string, answer: string) => (await api.post<CaseRoom>(`/cases/${id}/answer`, { answer })).data
export const followUp = async (id: string, outcome: 'IMPROVED' | 'SAME' | 'WORSE', note?: string) =>
  (await api.post<CaseRoom>(`/cases/${id}/followup`, { outcome, note })).data

export const searchLibrary = async (q: string) => (await api.get<LibraryHit[]>('/library', { params: { q } })).data
export const markHelpful = async (id: string) => { await api.post(`/library/${id}/helpful`) }
export const getImpact = async () => (await api.get<Impact>('/impact')).data
export const setAvailability = async (onDuty: boolean, languages: string[]) => { await api.put('/doctors/me/availability', { onDuty, languages }) }
export const listNotifications = async () => (await api.get<AppNotification[]>('/notifications')).data
export const markNotificationRead = async (id: string) => { await api.post(`/notifications/${id}/read`) }
