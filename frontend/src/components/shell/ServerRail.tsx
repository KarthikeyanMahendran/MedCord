import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Bell, BellOff, Bookmark, BookOpenCheck, CircleHelp, HandHeart, HeartHandshake, HeartPulse, MapPin, MessageCircle, Plus, Radar, Search, ShieldCheck, Stethoscope } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { colorFor, initialsOf } from '../ui'
import { listMine } from '../../api/communities'
import type { Community } from '../../api/communities'
import { useAuth } from '../../context/AuthContext'
import { START_TOUR_EVENT } from '../tour/steps'
import { useRealtime } from '../../context/RealtimeContext'

function RailButton({ to, label, end, badge, hasUnread, isMention, children }: {
  to: string; label: string; end?: boolean; badge?: number; hasUnread?: boolean; isMention?: boolean; children: React.ReactNode
}) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `mc-rail-btn ${isActive ? 'is-active' : ''} ${hasUnread ? 'has-unread' : ''}`} aria-label={label} data-tip={label}>
      <span className="mc-rail-pill" aria-hidden="true" />
      {children}
      <span className="mc-rail-label" aria-hidden="true">{label}</span>
      {badge && badge > 0 ? (
        <span className={`mc-rail-badge ${isMention ? 'is-mention' : ''}`} aria-hidden="true">
          {isMention ? '@' : (badge > 99 ? '99+' : badge)}
        </span>
      ) : null}
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
  const { unreads, totalMentions, totalDmUnreads, prefs, setDrawerOpen } = useRealtime()
  const [communities, setCommunities] = useState<Community[]>([])

  // Refresh on navigation: joining, leaving or creating changes the list.
  useEffect(() => { listMine().then(setCommunities).catch(() => undefined) }, [location.pathname])

  const communityBadges = useMemo(() => {
    const map: Record<string, { unread: number; mentions: number }> = {}
    Object.values(unreads).forEach((u) => {
      if (!u.communityId) return
      const cur = map[u.communityId] ?? { unread: 0, mentions: 0 }
      cur.unread += u.unreadCount
      cur.mentions += u.mentionCount
      map[u.communityId] = cur
    })
    return map
  }, [unreads])

  return (
    <nav className="mc-rail" aria-label="Communities">
      <RailButton to="/" end label="Home"><span className="mc-rail-icon mc-rail-home"><LogoMark /></span></RailButton>
      <RailButton to="/cases" label="Case rooms"><span className="mc-rail-icon"><Stethoscope size={18} /></span></RailButton>
      <RailButton to="/messages" label="Direct messages" badge={totalDmUnreads} hasUnread={totalDmUnreads > 0} isMention={totalDmUnreads > 0}>
        <span className="mc-rail-icon"><MessageCircle size={18} /></span>
      </RailButton>
      <div className="mc-rail-sep" aria-hidden="true" />
      {communities.map((c) => {
        const b = communityBadges[c.id]
        const hasMentions = (b?.mentions ?? 0) > 0
        return (
          <RailButton key={c.id} to={`/communities/${c.id}`} label={c.name} badge={hasMentions ? b?.mentions : b?.unread} hasUnread={(b?.unread ?? 0) > 0} isMention={hasMentions}>
            <span className="mc-rail-icon is-community" style={{ background: colorFor(c.name) }}>{initialsOf(c.name)}</span>
          </RailButton>
        )
      })}
      <RailButton to="/communities" end label="Browse & create communities"><span className="mc-rail-icon mc-rail-add"><Plus size={18} /></span></RailButton>
      <div className="mc-rail-grow" />
      <button type="button" className="mc-rail-btn" aria-label="Take a tour" data-tip="Take a tour" onClick={() => window.dispatchEvent(new Event(START_TOUR_EVENT))}>
        <span className="mc-rail-icon"><CircleHelp size={17} /></span>
        <span className="mc-rail-label" aria-hidden="true">Take a tour</span>
      </button>
      <RailButton to="/library" label="Verified answer library"><span className="mc-rail-icon"><BookOpenCheck size={17} /></span></RailButton>
      <RailButton to="/impact" label="Impact"><span className="mc-rail-icon"><BarChart3 size={17} /></span></RailButton>
      <button type="button" className="mc-rail-btn" aria-label="Notifications" data-tip={prefs?.dndActiveNow ? 'Notifications (DND active)' : 'Notifications'}
        onClick={() => setDrawerOpen(true)}>
        <span className="mc-rail-pill" aria-hidden="true" />
        <span className="mc-rail-icon">{prefs?.dndActiveNow ? <BellOff size={17} /> : <Bell size={17} />}</span>
        <span className="mc-rail-label" aria-hidden="true">Notifications</span>
        {totalMentions > 0 && <span className="mc-rail-badge is-mention" aria-hidden="true">@</span>}
      </button>
      <RailButton to="/bookmarks" label="Saved messages"><span className="mc-rail-icon"><Bookmark size={17} /></span></RailButton>
      <RailButton to="/dispatch" label="Volunteer help"><span className="mc-rail-icon"><HandHeart size={17} /></span></RailButton>
      <RailButton to="/checkin" label="Daily check-in"><span className="mc-rail-icon"><HeartPulse size={17} /></span></RailButton>
      <RailButton to="/fund" label="Care Fund"><span className="mc-rail-icon"><HeartHandshake size={17} /></span></RailButton>
      <RailButton to="/network" label="Care network map"><span className="mc-rail-icon"><MapPin size={17} /></span></RailButton>
      <RailButton to="/radar" label="Outbreak radar"><span className="mc-rail-icon"><Radar size={17} /></span></RailButton>
      <RailButton to="/search" label="Search messages"><span className="mc-rail-icon"><Search size={17} /></span></RailButton>
      {user?.platformRole === 'ADMIN' && <RailButton to="/admin/verifications" label="Verification queue"><span className="mc-rail-icon"><ShieldCheck size={17} /></span></RailButton>}
    </nav>
  )
}
