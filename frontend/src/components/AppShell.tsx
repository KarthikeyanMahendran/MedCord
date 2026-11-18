import { useEffect } from 'react'
import { LogOut, Moon, Plus, Sun } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Button } from './ui'
import { heartbeat } from '../api/dms'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

export function AppShell() {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()

  // Presence: tell the server we're here every 30s while the tab is visible.
  useEffect(() => {
    const beat = () => { if (document.visibilityState !== 'hidden') heartbeat().catch(() => undefined) }
    beat()
    const t = setInterval(beat, 30000)
    document.addEventListener('visibilitychange', beat)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', beat) }
  }, [])

  return (
    <>
      <header className="mc-topbar">
        <div className="mc-row">
          <div className="mc-logo" style={{ color: 'var(--mc-brand)' }}>
            <span className="mc-logo-mark" style={{ background: 'var(--mc-brand)', color: 'var(--mc-text-on-brand)' }}><Plus size={18} strokeWidth={3} /></span>MedCord
          </div>
          <nav className="mc-nav" aria-label="Main">
            <NavLink to="/communities">Communities</NavLink>
            <NavLink to="/messages">Messages</NavLink>
            <NavLink to="/search">Search</NavLink>
            <NavLink to="/" end>Profile</NavLink>
            {user?.platformRole === 'ADMIN' && <NavLink to="/admin/verifications">Verifications</NavLink>}
          </nav>
        </div>
        <div className="mc-row">
          <Button variant="icon" aria-label="Toggle theme" onClick={toggle}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</Button>
          <Button variant="secondary" size="sm" onClick={signOut}><LogOut size={14} /> Sign out</Button>
        </div>
      </header>
      <Outlet />
    </>
  )
}
