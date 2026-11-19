import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useMatch } from 'react-router-dom'
import {
  Bookmark, ChevronDown, Compass, Hash, LayoutDashboard, Megaphone, Mic, MicOff,
  Monitor, PhoneOff, Search, ShieldCheck, Users, Video, Volume2,
} from 'lucide-react'
import { PresenceDot } from '../chat/PresenceDot'
import { Avatar, Badge, Button } from '../ui'
import { getCommunity, listChannels } from '../../api/communities'
import type { Channel, Community } from '../../api/communities'
import { listDms } from '../../api/dms'
import type { Conversation } from '../../api/dms'
import { listCommunityVoiceRooms } from '../../api/voiceRooms'
import type { VoiceRoom } from '../../api/voiceRooms'
import { useAuth } from '../../context/AuthContext'
import { useRealtime } from '../../context/RealtimeContext'
import { useVoiceRoom } from '../../context/VoiceRoomContext'
import { UserPanel } from './UserPanel'

const communityCache = new Map<string, { community: Community; channels: Channel[] }>()

function CommunitySidebar({ id }: { id: string }) {
  const location = useLocation()
  const { unreads, subscribe } = useRealtime()
  const cached = communityCache.get(id)
  const [community, setCommunity] = useState<Community | null>(cached?.community ?? null)
  const [channels, setChannels] = useState<Channel[]>(cached?.channels ?? [])
  const [voiceRooms, setVoiceRooms] = useState<Record<string, VoiceRoom>>({})
  const active = location.pathname.split('/channels/')[1]

  useEffect(() => {
    let alive = true
    Promise.all([getCommunity(id), listChannels(id)])
      .then(([c, ch]) => {
        if (alive) {
          communityCache.set(id, { community: c, channels: ch })
          setCommunity(c)
          setChannels(ch)
        }
      })
      .catch(() => undefined)
    if (typeof listCommunityVoiceRooms === 'function') {
      Promise.resolve(listCommunityVoiceRooms(id))
        .then((rooms) => {
          if (!alive || !Array.isArray(rooms)) return
          const map: Record<string, VoiceRoom> = {}
          rooms.forEach((r) => { map[r.channelId] = r })
          setVoiceRooms(map)
        })
        .catch(() => undefined)
    }
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.type === 'VOICE_ROOM_UPDATED' && ev.communityId === id && ev.channelId) {
        setVoiceRooms((prev) => ({ ...prev, [ev.channelId!]: ev.payload as unknown as VoiceRoom }))
      }
    })
  }, [id, subscribe])

  const announcements = channels.filter((c) => c.type === 'ANNOUNCEMENT')
  const text = channels.filter((c) => c.type === 'TEXT')
  const voice = channels.filter((c) => c.type === 'VOICE')

  const row = (c: Channel) => {
    const u = unreads[c.id]
    const hasUnread = active !== c.id && (u?.unreadCount ?? 0) > 0
    const mentions = active !== c.id ? (u?.mentionCount ?? 0) : 0
    return (
      <Link key={c.id} to={`/communities/${id}/channels/${c.id}`}
        className={`mc-chan ${active === c.id ? 'active' : ''} ${hasUnread ? 'is-unread' : ''}`}
        aria-current={active === c.id ? 'page' : undefined}>
        {c.type === 'ANNOUNCEMENT' ? <Megaphone size={16} /> : c.type === 'VOICE' ? <Volume2 size={16} /> : <Hash size={16} />}
        <span className="mc-chan-name">{c.name}</span>
        {mentions > 0 && <span className="mc-chan-badge is-mention">@</span>}
        {mentions === 0 && hasUnread && <span className="mc-chan-badge">{u!.unreadCount > 99 ? '99+' : u!.unreadCount}</span>}
        {c.archived && <Badge tone="neutral">archived</Badge>}
      </Link>
    )
  }

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
        {voice.length > 0 && (
          <>
            <div className="mc-side-label">Voice rooms</div>
            {voice.map((c) => {
              const room = voiceRooms[c.id]
              return (
                <div key={c.id}>
                  {row(c)}
                  {room && room.participants.length > 0 && (
                    <div className="mc-side-voice-users">
                      {room.participants.map((p) => (
                        <div key={p.userId} className="mc-side-voice-user">
                          <Avatar name={p.displayName} size="sm" />
                          <span className="mc-chan-name">{p.displayName}</span>
                          {p.screenSharing && <Monitor size={11} className="is-live" />}
                          {p.camOn && <Video size={11} />}
                          {!p.micOn && <MicOff size={11} className="is-muted" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
        <div className="mc-side-label">Manage</div>
        <NavLink to={`/communities/${id}`} end className={({ isActive }) => `mc-chan ${isActive ? 'active' : ''}`}><Users size={16} /><span className="mc-chan-name">Members &amp; settings</span></NavLink>
      </div>
    </>
  )
}

let cachedConvs: Conversation[] = []

function DmSidebar() {
  const { user } = useAuth()
  const { unreads, subscribe } = useRealtime()
  const channelId = useMatch('/messages/:channelId')?.params.channelId
  const [convs, setConvs] = useState<Conversation[]>(cachedConvs)

  useEffect(() => {
    let alive = true
    const load = () => listDms().then((res) => {
      if (alive) {
        cachedConvs = res
        setConvs(res)
      }
    }).catch(() => undefined)

    if (cachedConvs.length === 0) void load()
    else void load() // background refresh while displaying cached

    const unsub = subscribe((ev) => {
      if (ev.type === 'MESSAGE_CREATED' && !ev.communityId) void load()
    })
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, 30000)
    return () => { alive = false; unsub(); clearInterval(t) }
  }, [subscribe])

  return (
    <>
      <div className="mc-side-head"><strong>Direct messages</strong></div>
      <div className="mc-side-scroll">
        {convs.length === 0 && <p className="mc-hint" style={{ padding: '8px' }}>No conversations yet. Message a member from any community&apos;s member list.</p>}
        {convs.map((c) => {
          const other = c.group ? undefined : c.participants.find((p) => p.id !== user?.id)
          const u = unreads[c.id]
          const unreadCount = c.id !== channelId ? (u?.unreadCount ?? 0) : 0
          return (
            <Link key={c.id} to={`/messages/${c.id}`} className={`mc-chan mc-dm ${c.id === channelId ? 'active' : ''} ${unreadCount > 0 ? 'is-unread' : ''}`} aria-current={c.id === channelId ? 'page' : undefined}>
              <span className="mc-dm-avatar"><Avatar name={c.name} size="sm" />{other && <PresenceDot online={other.online} />}</span>
              <span className="mc-dm-text">
                <span className="mc-chan-name">{c.name}</span>
                {c.lastMessage && <small>{c.lastMessage.excerpt}</small>}
              </span>
              {unreadCount > 0 && <span className="mc-chan-badge is-mention">@</span>}
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
        {link('/bookmarks', 'Saved messages', <Bookmark size={16} />)}
        {link('/search', 'Search', <Search size={16} />)}
        {user?.platformRole === 'ADMIN' && <><div className="mc-side-label">Admin</div>{link('/admin/verifications', 'Verifications', <ShieldCheck size={16} />)}</>}
      </div>
    </>
  )
}

function VoiceConnectionBar() {
  const voice = useVoiceRoom()
  if (!voice.room) return null
  return (
    <div className="mc-voice-dock" role="region" aria-label="Connected voice room">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="mc-voice-dock-status"><span className="mc-call-dot is-live" /> Voice connected</div>
        <Link to={`/communities/${voice.room.communityId}/channels/${voice.room.channelId}`} className="mc-voice-dock-room">
          <Volume2 size={12} /> {voice.room.name}
        </Link>
      </div>
      <div className="mc-row" style={{ gap: 2 }}>
        <Button variant="icon" size="sm" aria-label={voice.micOn ? 'Mute mic' : 'Unmute mic'} onClick={voice.toggleMic}>
          {voice.micOn ? <Mic size={14} /> : <MicOff size={14} />}
        </Button>
        <Button variant="icon" size="sm" aria-label={voice.screenSharing ? 'Stop screen share' : 'Share screen'} onClick={voice.toggleScreenShare}>
          <Monitor size={14} />
        </Button>
        <Button variant="icon" size="sm" aria-label="Disconnect voice" onClick={voice.leave} style={{ color: 'var(--mc-danger)' }}>
          <PhoneOff size={14} />
        </Button>
      </div>
    </div>
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
      <VoiceConnectionBar />
      <UserPanel />
    </aside>
  )
}
