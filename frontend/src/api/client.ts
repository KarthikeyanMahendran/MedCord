import axios, { AxiosError } from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'

const REFRESH_KEY = 'mc_refresh_token'

/** Access token lives in memory only; refresh token in localStorage (see docs/ui-ux-guide.md for hardening plan). */
let accessToken: string | null = null

export const tokenStore = {
  get access() { return accessToken },
  get refresh() { try { return localStorage.getItem(REFRESH_KEY) } catch { return null } },
  set(access: string, refresh: string) {
    accessToken = access
    try { localStorage.setItem(REFRESH_KEY, refresh) } catch { /* storage unavailable */ }
  },
  clear() {
    accessToken = null
    try { localStorage.removeItem(REFRESH_KEY) } catch { /* ignore */ }
  },
}

export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1' })

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

let refreshing: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStore.refresh
  if (!refresh) return null
  try {
    const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken: refresh })
    tokenStore.set(data.accessToken, data.refreshToken)
    return data.accessToken as string
  } catch {
    tokenStore.clear()
    return null
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    const isAuthCall = original?.url?.includes('/auth/')
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true
      refreshing ??= refreshAccessToken().finally(() => { refreshing = null })
      const token = await refreshing
      if (token) {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      }
      window.dispatchEvent(new Event('mc:session-expired'))
    }
    return Promise.reject(error)
  },
)

/** Extract a human message from an RFC 7807 problem response. */
export function problemMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { detail?: string; errors?: Record<string, string> } | undefined
    if (d?.errors) return Object.values(d.errors)[0] ?? 'Validation failed'
    if (d?.detail) return d.detail
    if (!err.response) return 'Cannot reach the server. Is the backend running?'
  }
  return 'Something went wrong. Please try again.'
}

export function fieldErrors(err: unknown): Record<string, string> {
  if (axios.isAxiosError(err)) return (err.response?.data as { errors?: Record<string, string> })?.errors ?? {}
  return {}
}
