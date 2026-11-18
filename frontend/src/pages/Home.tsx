import { LogOut, Moon, Plus, Sun } from 'lucide-react'
import { Badge, Button, Card, CardBody } from '../components/ui'
import type { Tone } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

const verifyTone: Record<string, Tone> = { APPROVED: 'success', PENDING: 'warning', REJECTED: 'danger' }
const statusTone: Record<string, Tone> = { ACTIVE: 'success', PENDING: 'warning', SUSPENDED: 'danger' }

export default function Home() {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  if (!user) return null
  const initials = user.displayName.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <>
      <header className="mc-topbar">
        <div className="mc-logo" style={{ color: 'var(--mc-brand)' }}>
          <span className="mc-logo-mark" style={{ background: 'var(--mc-brand)', color: 'var(--mc-text-on-brand)' }}><Plus size={18} strokeWidth={3} /></span>MedCord
        </div>
        <div className="mc-row">
          <Button variant="icon" aria-label="Toggle theme" onClick={toggle}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</Button>
          <Button variant="secondary" size="sm" onClick={signOut}><LogOut size={14} /> Sign out</Button>
        </div>
      </header>
      <main className="mc-page">
        <Card>
          <CardBody>
            <div className="mc-row" style={{ marginBottom: 20 }}>
              <div className="mc-avatar" aria-hidden="true">{initials}</div>
              <div>
                <h1 style={{ fontSize: 22 }}>{user.displayName}</h1>
                <div className="mc-row" style={{ marginTop: 6 }}>
                  <Badge tone={statusTone[user.status] ?? 'neutral'}>{user.status}</Badge>
                  {user.platformRole === 'ADMIN' && <Badge tone="info">Platform admin</Badge>}
                  {user.verificationStatus && <Badge tone={verifyTone[user.verificationStatus] ?? 'neutral'}>License {user.verificationStatus.toLowerCase()}</Badge>}
                </div>
              </div>
            </div>
            <dl className="mc-dl">
              <dt>Email</dt><dd>{user.email}</dd>
              <dt>Specialty</dt><dd>{user.specialty ?? '—'}</dd>
              <dt>License country</dt><dd>{user.licenseCountry ?? '—'}</dd>
              <dt>Account ID</dt><dd style={{ fontFamily: 'monospace', fontSize: 12 }}>{user.id}</dd>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <strong>Communities are coming next.</strong>
            <p className="mc-hint" style={{ margin: '6px 0 0' }}>Channels, threads and messaging arrive in the upcoming milestones.</p>
          </CardBody>
        </Card>
      </main>
    </>
  )
}
