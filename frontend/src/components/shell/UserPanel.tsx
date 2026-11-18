import { LogOut, Moon, Sun } from 'lucide-react'
import { Avatar, Button } from '../ui'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'

export function UserPanel() {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  if (!user) return null
  return (
    <div className="mc-userpanel">
      <div className="mc-userpanel-who" title={user.email}>
        <span className="mc-userpanel-avatar"><Avatar name={user.displayName} size="sm" /><span className="mc-presence is-online mc-userpanel-dot" role="img" aria-label="You are online" /></span>
        <span style={{ minWidth: 0 }}>
          <span className="mc-userpanel-name">{user.displayName}</span>
          <span className="mc-userpanel-sub">{user.specialty ?? 'Member'}</span>
        </span>
      </div>
      <Button variant="icon" aria-label="Toggle theme" onClick={toggle}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</Button>
      <Button variant="icon" aria-label="Sign out" onClick={signOut}><LogOut size={17} /></Button>
    </div>
  )
}
