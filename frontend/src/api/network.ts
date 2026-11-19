import { api } from './client'

export interface NetworkPerson { id: string; name: string; kind: string; detail: string; organisation: string | null; languages: string[]; cases72h: number; lastCaseAt: string | null }
export interface NetworkArea { id: string; name: string; district: string; state: string; lat: number | null; lng: number | null; cases72h: number; liveAlerts: number; people: NetworkPerson[] }
export interface NetworkDoctor { id: string; name: string; specialty: string }
export interface Network { scope: 'ALL' | 'AREA'; areas: NetworkArea[]; doctors: NetworkDoctor[]; myAreaId: string | null }

export async function getNetwork() { return (await api.get<Network>('/network')).data }
