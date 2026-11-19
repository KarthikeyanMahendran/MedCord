import { useState } from 'react'
import { LogOut, Moon, Sun, Type } from 'lucide-react'
import { Avatar, Button } from '../ui'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { SIZES, applyTextSize, savedTextSize } from '../../lib/textSize'
import type { TextSize } from '../../lib/textSize'

export function UserPanel() {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const [size, setSize] = useState<TextSize>(savedTextSize)
  const nextSize = () => { const next = SIZES[(SIZES.findIndex((s) => s.id === size) + 1) % SIZES.length].id; setSize(next); applyTextSize(next) }
  if (!user) return null
  return (
    <div className="mc-userpanel">
      <div className="mc-userpanel-who" title={user.email}>
        <span className="mc-userpanel-avatar">
          <Avatar name={user.displayName} size="sm" />
          <span className="mc-presence is-online mc-userpanel-dot" role="img" aria-label="You are online" />
        </span>
        <span style={{ minWidth: 0 }}>
          <span className="mc-userpanel-name">{user.displayName}</span>
          <span className="mc-userpanel-sub">{user.specialty ?? 'Member'}</span>
        </span>
      </div>
      <Button variant="icon" aria-label={`Text size: ${SIZES.find((s) => s.id === size)?.label}. Press to change`} title={`Text size: ${SIZES.find((s) => s.id === size)?.label}`} data-testid="text-size" onClick={nextSize}><Type size={size === 'normal' ? 16 : size === 'large' ? 18 : 20} /></Button>
      <Button variant="icon" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} data-testid="theme-toggle" onClick={toggle}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</Button>
      <Button variant="icon" aria-label="Sign out" onClick={signOut}><LogOut size={16} /></Button>
    </div>
  )
}
