import { useEffect, useState } from 'react'
import { MessageCircle, Plus, Search, ShieldCheck } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { colorFor, initialsOf } from '../ui'
import { listMine } from '../../api/communities'
import type { Community } from '../../api/communities'
import { useAuth } from '../../context/AuthContext'

function RailButton({ to, label, end, children }: { to: string; label: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `mc-rail-btn ${isActive ? 'is-active' : ''}`} aria-label={label} data-tip={label}>
      <span className="mc-rail-pill" aria-hidden="true" />
      {children}
    </NavLink>
  )
}

function LogoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Left-most column: home, DMs, one tile per community, then tools. */
export function ServerRail() {
  const { user } = useAuth()
  const location = useLocation()
  const [communities, setCommunities] = useState<Community[]>([])

  // Refresh on navigation: joining, leaving or creating changes the list.
  useEffect(() => { listMine().then(setCommunities).catch(() => undefined) }, [location.pathname])

  return (
    <nav className="mc-rail" aria-label="Communities">
      <RailButton to="/" end label="Home"><span className="mc-rail-icon mc-rail-home"><LogoMark /></span></RailButton>
      <RailButton to="/messages" label="Direct messages"><span className="mc-rail-icon"><MessageCircle size={18} /></span></RailButton>
      <div className="mc-rail-sep" aria-hidden="true" />
      {communities.map((c) => (
        <RailButton key={c.id} to={`/communities/${c.id}`} label={c.name}>
          <span className="mc-rail-icon is-community" style={{ background: colorFor(c.name) }}>{initialsOf(c.name)}</span>
        </RailButton>
      ))}
      <RailButton to="/communities" end label="Browse & create communities"><span className="mc-rail-icon mc-rail-add"><Plus size={18} /></span></RailButton>
      <div className="mc-rail-grow" />
      <RailButton to="/search" label="Search messages"><span className="mc-rail-icon"><Search size={17} /></span></RailButton>
      {user?.platformRole === 'ADMIN' && <RailButton to="/admin/verifications" label="Verification queue"><span className="mc-rail-icon"><ShieldCheck size={17} /></span></RailButton>}
    </nav>
  )
}
