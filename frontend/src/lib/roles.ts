/** Who is signing in. Health worker and ASHA worker are both health-worker accounts; an ASHA worker also proves who they are with their ASHA / NHM ID. */
export type LoginRole = 'HEALTH_WORKER' | 'ASHA' | 'DOCTOR' | 'ADMIN'
export type AccountKind = 'HEALTH_WORKER' | 'DOCTOR' | 'ADMIN'

export const toAccountKind = (r: LoginRole): AccountKind => (r === 'DOCTOR' ? 'DOCTOR' : r === 'ADMIN' ? 'ADMIN' : 'HEALTH_WORKER')

/** Value used in /register?role=... */
export const REGISTER_PARAM: Partial<Record<LoginRole, string>> = { HEALTH_WORKER: 'worker', ASHA: 'asha', DOCTOR: 'doctor' }
export const roleFromParam = (p: string | null): LoginRole | null =>
  (Object.entries(REGISTER_PARAM).find(([, v]) => v === p)?.[0] as LoginRole | undefined) ?? null

export const ROLE_TITLE: Record<LoginRole, string> = { HEALTH_WORKER: 'Health worker', ASHA: 'ASHA worker', DOCTOR: 'Doctor', ADMIN: 'Admin' }
/** How the role reads inside a sentence (ASHA keeps its capitals). */
export const ROLE_NOUN: Record<LoginRole, string> = { HEALTH_WORKER: 'health worker', ASHA: 'ASHA worker', DOCTOR: 'doctor', ADMIN: 'admin' }

const ROLE_KEY = 'mc_login_role'
const IDS_KEY = 'mc_login_ids'
const ROLES: LoginRole[] = ['HEALTH_WORKER', 'ASHA', 'DOCTOR', 'ADMIN']

export function savedRole(): LoginRole {
  try {
    const r = localStorage.getItem(ROLE_KEY) as LoginRole | null
    if (r && ROLES.includes(r)) return r
  } catch { /* storage can be blocked */ }
  return 'HEALTH_WORKER'
}

export interface Identity { licence: string; specialty: string }

function store(): Record<string, Identity> {
  try { return JSON.parse(localStorage.getItem(IDS_KEY) ?? '{}') as Record<string, Identity> } catch { return {} }
}
const slot = (role: LoginRole, email: string) => `${role}|${email.trim().toLowerCase()}`

/** The ID details this device last used successfully for this role and email. Used to autofill, never sent anywhere else. */
export function savedIdentity(role: LoginRole, email: string): Identity {
  return store()[slot(role, email)] ?? { licence: '', specialty: '' }
}

export function rememberLogin(role: LoginRole, email: string, id: Partial<Identity> = {}) {
  try {
    localStorage.setItem(ROLE_KEY, role)
    if ((role === 'DOCTOR' || role === 'ASHA') && id.licence) {
      localStorage.setItem(IDS_KEY, JSON.stringify({ ...store(), [slot(role, email)]: { licence: id.licence.trim(), specialty: (id.specialty ?? '').trim() } }))
    }
  } catch { /* ignore */ }
}
