import { api, tokenStore } from './client'

export interface TokenResponse { accessToken: string; refreshToken: string; tokenType: string; expiresIn: number }
export interface Me {
  id: string; email: string; displayName: string; status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'
  platformRole: 'USER' | 'ADMIN'; specialty: string | null; licenseCountry: string | null
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null; bio: string | null; rejectionReason: string | null
  accountType?: AccountType; preferredLanguage?: string
}
export type AccountType = 'DOCTOR' | 'HEALTH_WORKER'
export interface RegisterInput {
  accountType: AccountType; email: string; password: string; displayName: string
  /** Doctors */
  specialty?: string; licenseNumber?: string; licenseCountry?: string
  /** Health workers */
  regionId?: string; preferredLanguage?: string; organisation?: string; workerType?: 'ASHA' | 'CHW'
}
export interface RegionOption { id: string; name: string; district: string; state: string }

/** Sent with the password. Doctors add speciality + licence number; an ASHA worker adds workerType ASHA + the ASHA / NHM ID (in licenseNumber). */
export interface LoginRole { accountType: 'DOCTOR' | 'HEALTH_WORKER' | 'ADMIN'; workerType?: 'ASHA' | 'CHW'; specialty?: string; licenseNumber?: string }
export async function login(email: string, password: string, role?: LoginRole) {
  const { data } = await api.post<TokenResponse>('/auth/login', { email, password, ...role })
  tokenStore.set(data.accessToken, data.refreshToken)
}
export async function register(input: RegisterInput) {
  const { data } = await api.post<TokenResponse>('/auth/register', input)
  tokenStore.set(data.accessToken, data.refreshToken)
}
export async function listRegions() { return (await api.get<RegionOption[]>('/auth/regions')).data }
export async function listSpecialties() { return (await api.get<string[]>('/auth/specialties')).data }
export async function logout() {
  const refresh = tokenStore.refresh
  tokenStore.clear()
  if (refresh) await api.post('/auth/logout', { refreshToken: refresh }).catch(() => undefined)
}
export async function fetchMe() {
  const { data } = await api.get<Me>('/me')
  return data
}
export async function updateProfile(input: { displayName?: string; bio?: string; specialty?: string }) {
  const { data } = await api.patch<Me>('/me', input)
  return data
}
export async function resubmitVerification(licenseNumber: string, licenseCountry: string) {
  const { data } = await api.post<Me>('/me/verification', { licenseNumber, licenseCountry })
  return data
}
