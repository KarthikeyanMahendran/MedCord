import { api, tokenStore } from './client'

export interface TokenResponse { accessToken: string; refreshToken: string; tokenType: string; expiresIn: number }
export interface Me {
  id: string; email: string; displayName: string; status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'
  platformRole: 'USER' | 'ADMIN'; specialty: string | null; licenseCountry: string | null
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null; bio: string | null; rejectionReason: string | null
}
export interface RegisterInput {
  email: string; password: string; displayName: string; specialty: string; licenseNumber: string; licenseCountry: string
}

export async function login(email: string, password: string) {
  const { data } = await api.post<TokenResponse>('/auth/login', { email, password })
  tokenStore.set(data.accessToken, data.refreshToken)
}
export async function register(input: RegisterInput) {
  const { data } = await api.post<TokenResponse>('/auth/register', input)
  tokenStore.set(data.accessToken, data.refreshToken)
}
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
