import { api } from './client'

export type Severity = 'WATCH' | 'ALERT'
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'

export interface OutbreakAlert {
  id: string; regionId: string; regionName: string; district: string; state: string; lat: number | null; lng: number | null
  syndrome: string; syndromeLabel: string; severity: Severity; status: AlertStatus
  caseCount: number; redCount: number; threshold: number
  firstCaseAt: string; lastCaseAt: string; demo: boolean
  acknowledgedAt: string | null; acknowledgedBy: string | null; note: string | null
  createdAt: string; resolvedAt: string | null
}
export interface RegionPoint { id: string; name: string; district: string; state: string; lat: number | null; lng: number | null; cases72h: number }
export interface Radar { alerts: OutbreakAlert[]; regions: RegionPoint[]; windowHours: number; canManage: boolean; isAdmin: boolean }
export interface ClusterCase { village: string | null; age: number | null; sex: string | null; urgency: 'GREEN' | 'AMBER' | 'RED'; summary: string; createdAt: string }
export interface AlertDetail {
  alert: OutbreakAlert; guidance: string[]; disclaimer: string; canSeeCases: boolean
  cases: ClusterCase[]; timeline: number[]; bucketHours: number
}

export const isLive = (a: OutbreakAlert) => a.status !== 'RESOLVED'

export async function getRadar() { return (await api.get<Radar>('/outbreaks')).data }
export async function getAlert(id: string) { return (await api.get<AlertDetail>(`/outbreaks/${id}`)).data }
export async function acknowledgeAlert(id: string, note?: string) { return (await api.post<OutbreakAlert>(`/outbreaks/${id}/acknowledge`, { note })).data }
export async function resolveAlert(id: string) { return (await api.post<OutbreakAlert>(`/outbreaks/${id}/resolve`)).data }
export async function runDemo() { return (await api.post<{ created: number; totalDemoCases: number; region: string }>('/outbreaks/demo')).data }
export async function resetDemo() { return (await api.delete<{ removed: number }>('/outbreaks/demo')).data }
