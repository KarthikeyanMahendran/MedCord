import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useMatch } from 'react-router-dom'
import { ChevronDown, Compass, Hash, LayoutDashboard, Megaphone, Search, ShieldCheck, Users } from 'lucide-react'
import { PresenceDot } from '../chat/PresenceDot'
import { Avatar, Badge } from '../ui'
import { getCommunity, listChannels } from '../../api/communities'
import type { Channel, Community } from '../../api/communities'
import { listDms } from '../../api/dms'
import type { Conversation } from '../../api/dms'
import { useAuth } from '../../context/AuthContext'
import { UserPanel } from './UserPanel'

function CommunitySidebar({ id }: { id: string }) {
  const location = useLocation()
  const [community, setCommunity] = useState<Community | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const active = location.pathname.split('/channels/')[1]

  useEffect(() => {
    let alive = true
    Promise.all([getCommunity(id), listChannels(id)]).then(([c, ch]) => { if (alive) { setCommunity(c); setChannels(ch) } }).catch(() => undefined)
    return () => { alive = false }
  }, [id, location.pathname])

  const announcements = channels.filter((c) => c.type === 'ANNOUNCEMENT')
  const text = channels.filter((c) => c.type === 'TEXT')
  const row = (c: Channel) => (
    <Link key={c.id} to={`/communities/${id}/channels/${c.id}`} className={`mc-chan ${active === c.id ? 'active' : ''}`} aria-current={active === c.id ? 'page' : undefined}>
      {c.type === 'ANNOUNCEMENT' ? <Megaphone size={16} /> : <Hash size={16} />}<span className="mc-chan-name">{c.name}</span>{c.archived && <Badge tone="neutral">archived</Badge>}
    </Link>
  )

  return (
    <>
      <Link to={`/communities/${id}`} className="mc-side-head" aria-label="Community settings and members">
        <strong>{community?.name ?? '…'}</strong>
        <ChevronDown size={16} />
      </Link>
      <div className="mc-side-scroll">
        {announcements.length > 0 && <><div className="mc-side-label">Announcements</div>{announcements.map(row)}</>}
        <div className="mc-side-label">Text channels</div>
        {text.map(row)}
        <div className="mc-side-label">Manage</div>
        <NavLink to={`/communities/${id}`} end className={({ isActive }) => `mc-chan ${isActive ? 'active' : ''}`}><Users size={16} /><span className="mc-chan-name">Members &amp; settings</span></NavLink>
      </div>
    </>
  )
}

function DmSidebar() {
  const { user } = useAuth()
  const channelId = useMatch('/messages/:channelId')?.params.channelId
  const [convs, setConvs] = useState<Conversation[]>([])
  useEffect(() => {
    const load = () => listDms().then(setConvs).catch(() => undefined)
    void load()
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, 15000)
    return () => clearInterval(t)
  }, [channelId])
  return (
    <>
      <div className="mc-side-head"><strong>Direct messages</strong></div>
      <div className="mc-side-scroll">
        {convs.length === 0 && <p className="mc-hint" style={{ padding: '8px' }}>No conversations yet. Message a member from any community&apos;s member list.</p>}
        {convs.map((c) => {
          const other = c.group ? undefined : c.participants.find((p) => p.id !== user?.id)
          return (
            <Link key={c.id} to={`/messages/${c.id}`} className={`mc-chan mc-dm ${c.id === channelId ? 'active' : ''}`} aria-current={c.id === channelId ? 'page' : undefined}>
              <span className="mc-dm-avatar"><Avatar name={c.name} size="sm" />{other && <PresenceDot online={other.online} />}</span>
              <span className="mc-dm-text">
                <span className="mc-chan-name">{c.name}</span>
                {c.lastMessage && <small>{c.lastMessage.excerpt}</small>}
              </span>
            </Link>
          )
        })}
      </div>
    </>
  )
}

function NavSidebar() {
  const { user } = useAuth()
  const link = (to: string, label: string, icon: React.ReactNode, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => `mc-chan ${isActive ? 'active' : ''}`}>{icon}<span className="mc-chan-name">{label}</span></NavLink>
  )
  return (
    <>
      <div className="mc-side-head"><strong>MedCord</strong></div>
      <div className="mc-side-scroll">
        {link('/', 'Overview', <LayoutDashboard size={16} />, true)}
        {link('/communities', 'Communities', <Compass size={16} />)}
        {link('/search', 'Search', <Search size={16} />)}
        {user?.platformRole === 'ADMIN' && <>{<div className="mc-side-label">Admin</div>}{link('/admin/verifications', 'Verifications', <ShieldCheck size={16} />)}</>}
      </div>
    </>
  )
}

/** Second column: contextual to the route. */
export function SideColumn() {
  const community = useMatch('/communities/:id/*')
  const dms = useMatch('/messages/*')
  const id = community?.params.id
  return (
    <aside className="mc-side" aria-label="Navigation">
      {id ? <CommunitySidebar id={id} /> : dms ? <DmSidebar /> : <NavSidebar />}
      <UserPanel />
    </aside>
  )
}
