import { useEffect, useState } from 'react'
import { Compass, Home, MessageCircle, Plus, Search, ShieldCheck } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { gradientFor, initialsOf } from '../ui'
import { listMine } from '../../api/communities'
import type { Community } from '../../api/communities'
import { useAuth } from '../../context/AuthContext'

function RailButton({ to, label, end, children, style }: { to: string; label: string; end?: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `mc-rail-btn ${isActive ? 'is-active' : ''}`} aria-label={label} data-tip={label} style={style}>
      <span className="mc-rail-pill" aria-hidden="true" />
      {children}
    </NavLink>
  )
}

/** Left-most column: home, DMs, one squircle per community, discover, tools. */
export function ServerRail() {
  const { user } = useAuth()
  const location = useLocation()
  const [communities, setCommunities] = useState<Community[]>([])

  // Refresh when navigating (joining/leaving/creating changes the list).
  useEffect(() => { listMine().then(setCommunities).catch(() => undefined) }, [location.pathname])

  return (
    <nav className="mc-rail" aria-label="Communities">
      <RailButton to="/" end label="Home"><span className="mc-rail-icon mc-rail-home"><Home size={22} /></span></RailButton>
      <RailButton to="/messages" label="Direct messages"><span className="mc-rail-icon"><MessageCircle size={22} /></span></RailButton>
      <div className="mc-rail-sep" aria-hidden="true" />
      {communities.map((c) => (
        <RailButton key={c.id} to={`/communities/${c.id}`} label={c.name}>
          <span className="mc-rail-icon" style={{ background: gradientFor(c.name), color: '#fff' }}>{initialsOf(c.name)}</span>
        </RailButton>
      ))}
      <RailButton to="/communities" end label="Browse and create communities"><span className="mc-rail-icon mc-rail-add"><Plus size={22} /></span></RailButton>
      <div className="mc-rail-grow" />
      <RailButton to="/search" label="Search messages"><span className="mc-rail-icon mc-rail-tool"><Search size={20} /></span></RailButton>
      {user?.platformRole === 'ADMIN' && <RailButton to="/admin/verifications" label="Verification queue"><span className="mc-rail-icon mc-rail-tool"><ShieldCheck size={20} /></span></RailButton>}
      <RailButton to="/communities" label="Discover communities" end><span className="mc-rail-icon mc-rail-tool"><Compass size={20} /></span></RailButton>
    </nav>
  )
}
