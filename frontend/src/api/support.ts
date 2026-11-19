import { api } from './client'

export type DispatchKind = 'TRANSPORT' | 'MEDICINE' | 'VISIT' | 'FOOD' | 'OTHER'
export interface Dispatch {
  id: string; kind: DispatchKind; urgency: 'NORMAL' | 'URGENT'; title: string; details: string | null; area: string | null
  status: 'OPEN' | 'CLAIMED' | 'DONE' | 'CANCELLED'; requesterId: string; requesterName: string; volunteerId: string | null; volunteerName: string | null
  createdAt: string; mine: boolean; mineAsVolunteer: boolean
}
export interface Checkin { id: string; mood: number; note: string | null; createdAt: string }
export interface MyCheckins { recent: Checkin[]; streak: number; doneToday: boolean }
export interface CircleItem { id: string; userId: string; name: string; mood: number; note: string | null; createdAt: string; cheers: number; cheered: boolean; needsKindWord: boolean }

export const listDispatch = async (scope: 'open' | 'mine') => (await api.get<Dispatch[]>('/dispatch', { params: { scope } })).data
export const createDispatch = async (b: { kind: DispatchKind; urgency: 'NORMAL' | 'URGENT'; title: string; details?: string; area?: string }) => (await api.post<Dispatch>('/dispatch', b)).data
export const claimDispatch = async (id: string) => (await api.post<Dispatch>(`/dispatch/${id}/claim`)).data
export const finishDispatch = async (id: string) => (await api.post<Dispatch>(`/dispatch/${id}/done`)).data
export const cancelDispatch = async (id: string) => (await api.post<Dispatch>(`/dispatch/${id}/cancel`)).data

export const myCheckins = async () => (await api.get<MyCheckins>('/checkins/mine')).data
export const checkIn = async (b: { mood: number; note?: string; shared: boolean }) => (await api.post<MyCheckins>('/checkins', b)).data
export const circle = async () => (await api.get<CircleItem[]>('/checkins/circle')).data
export const cheer = async (id: string) => { await api.post(`/checkins/${id}/cheer`) }
