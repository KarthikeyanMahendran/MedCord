import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import * as authApi from '../api/auth'
import type { Me, RegisterInput } from '../api/auth'
import { tokenStore } from '../api/client'
import { disconnectNexconn } from '../lib/nexconn'

interface AuthState {
  user: Me | null
  loading: boolean
  signIn: (email: string, password: string, role?: authApi.LoginRole) => Promise<void>
  signUp: (input: RegisterInput) => Promise<void>
  signOut: () => Promise<void>
  setUser: (u: Me) => void
}

const Ctx = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [loading, setLoading] = useState<boolean>(() => tokenStore.refresh !== null)

  // Restore session: the axios interceptor transparently refreshes using the stored refresh token.
  useEffect(() => {
    if (tokenStore.refresh === null) return
    authApi.fetchMe().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const expired = () => setUser(null)
    window.addEventListener('mc:session-expired', expired)
    return () => window.removeEventListener('mc:session-expired', expired)
  }, [])

  const signIn = useCallback(async (email: string, password: string, role?: authApi.LoginRole) => {
    await authApi.login(email, password, role)
    setUser(await authApi.fetchMe())
  }, [])
  const signUp = useCallback(async (input: RegisterInput) => {
    await authApi.register(input)
    setUser(await authApi.fetchMe())
  }, [])
  const signOut = useCallback(async () => {
    void disconnectNexconn()
    await authApi.logout()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, signIn, signUp, signOut, setUser }), [user, loading, signIn, signUp, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth must be used inside AuthProvider')
  return c
}
