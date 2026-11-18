import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type Theme = 'light' | 'dark'
const KEY = 'mc_theme'
const Ctx = createContext<{ theme: Theme; toggle: () => void } | undefined>(undefined)

function initial(): Theme {
  try {
    const s = localStorage.getItem(KEY)
    if (s === 'light' || s === 'dark') return s
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initial)
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark') }, [theme])
  const toggle = useCallback(() => setTheme((t) => {
    const next = t === 'light' ? 'dark' : 'light'
    try { localStorage.setItem(KEY, next) } catch { /* ignore */ }
    return next
  }), [])
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTheme must be used inside ThemeProvider')
  return c
}
