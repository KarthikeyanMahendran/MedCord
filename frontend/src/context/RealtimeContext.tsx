import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, tokenStore } from '../api/client'
import {
  getNotificationPrefs,
  listUnreads,
  markChannelRead,
  setChannelNotificationLevel,
  updateNotificationPrefs,
} from '../api/notifications'
import type { ChannelNotifLevel, ChannelUnread, NotificationPrefs } from '../api/notifications'
import { useAuth } from './AuthContext'

export interface RealtimeEvent {
  type: string
  channelId: string | null
  communityId: string | null
  payload: Record<string, unknown>
  at: string
}

export interface ToastNotice {
  id: string
  kind: 'MENTION' | 'DM'
  channelId: string
  communityId: string | null
  channelName: string
  authorName: string
  excerpt: string
  label: string
}

type EventListener = (ev: RealtimeEvent) => void

interface RealtimeApi {
  connected: boolean
  subscribe: (fn: EventListener) => () => void
  unreads: Record<string, ChannelUnread>
  totalMentions: number
  totalDmUnreads: number
  refreshUnreads: () => Promise<void>
  markRead: (channelId: string, messageId?: string) => Promise<void>
  prefs: NotificationPrefs | null
  refreshPrefs: () => Promise<void>
  savePrefs: (b: { dndEnabled?: boolean; dndStart?: string | null; dndEnd?: string | null; showToasts?: boolean }) => Promise<void>
  setChannelLevel: (channelId: string, level: ChannelNotifLevel) => Promise<void>
  toasts: ToastNotice[]
  dismissToast: (id: string) => void
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
}

const Ctx = createContext<RealtimeApi | undefined>(undefined)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [connected, setConnected] = useState(false)
  const [unreads, setUnreads] = useState<Record<string, ChannelUnread>>({})
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [toasts, setToasts] = useState<ToastNotice[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const listeners = useRef<Set<EventListener>>(new Set())

  const subscribe = useCallback((fn: EventListener) => {
    listeners.current.add(fn)
    return () => { listeners.current.delete(fn) }
  }, [])

  const refreshUnreads = useCallback(async () => {
    try {
      const list = await listUnreads()
      const map: Record<string, ChannelUnread> = {}
      for (const item of list) map[item.channelId] = item
      setUnreads(map)
    } catch { /* ignore transient network error */ }
  }, [])

  const refreshPrefs = useCallback(async () => {
    try { setPrefs(await getNotificationPrefs()) } catch { /* ignore */ }
  }, [])

  const markRead = useCallback(async (channelId: string, messageId?: string) => {
    setUnreads((prev) => {
      const cur = prev[channelId]
      if (!cur || (cur.unreadCount === 0 && cur.mentionCount === 0 && (!messageId || cur.lastReadMessageId === messageId))) return prev
      return { ...prev, [channelId]: { ...cur, unreadCount: 0, mentionCount: 0, lastReadMessageId: messageId ?? cur.lastReadMessageId } }
    })
    try { await markChannelRead(channelId, messageId) } catch { /* ignore */ }
  }, [])

  const savePrefs = useCallback(async (b: { dndEnabled?: boolean; dndStart?: string | null; dndEnd?: string | null; showToasts?: boolean }) => {
    setPrefs(await updateNotificationPrefs(b))
  }, [])

  const setChannelLevel = useCallback(async (channelId: string, level: ChannelNotifLevel) => {
    setPrefs(await setChannelNotificationLevel(channelId, level))
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Load initial unreads + notification prefs
  useEffect(() => {
    if (!user) { setUnreads({}); setPrefs(null); return }
    void refreshUnreads()
    void refreshPrefs()
  }, [user, refreshUnreads, refreshPrefs])

  // Persistent authenticated SSE stream with auto-reconnect
  useEffect(() => {
    if (!user) return
    let stopped = false
    let abort: AbortController | null = null
    let backoff = 1000

    const dispatch = (ev: RealtimeEvent) => {
      listeners.current.forEach((fn) => {
        try { fn(ev) } catch { /* isolate listener errors */ }
      })
      if (ev.type === 'MESSAGE_CREATED' || ev.type === 'READ_STATE_UPDATED') {
        void refreshUnreads()
      }
      if (ev.type === 'NOTIFICATION') {
        void refreshUnreads()
        const p = ev.payload
        const targetChannelId = String(p.channelId ?? ev.channelId ?? '')
        // Suppress popup toast if user is already inside the active chat interface
        const isCurrentChat = typeof window !== 'undefined' && targetChannelId &&
          (window.location.pathname.endsWith('/' + targetChannelId) ||
           window.location.pathname.includes('/channels/' + targetChannelId) ||
           window.location.pathname.includes('/messages/' + targetChannelId))

        if (!p.suppressed && !isCurrentChat) {
          const toastId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          const notice: ToastNotice = {
            id: toastId,
            kind: p.kind === 'DM' ? 'DM' : 'MENTION',
            channelId: targetChannelId,
            communityId: p.communityId ? String(p.communityId) : ev.communityId,
            channelName: String(p.channelName ?? ''),
            authorName: String(p.authorName ?? ''),
            excerpt: String(p.excerpt ?? ''),
            label: String(p.label ?? ''),
          }
          setToasts((prev) => [notice, ...prev].slice(0, 4))
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 6000)
        }
      }
    }

    const connect = async () => {
      while (!stopped) {
        abort = new AbortController()
        try {
          const base = api.defaults.baseURL ?? '/api/v1'
          const token = tokenStore.access
          if (!token) {
            await new Promise((r) => setTimeout(r, 1500))
            continue
          }
          const res = await fetch(`${base}/realtime/stream`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            signal: abort.signal,
          })
          if (res.status === 401) {
            // Trigger axios refresh via lightweight /me/unreads call
            await refreshUnreads()
            await new Promise((r) => setTimeout(r, 1000))
            continue
          }
          if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`)
          setConnected(true)
          backoff = 1000

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buf = ''
          while (!stopped) {
            const { value, done } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const frames = buf.split('\n\n')
            buf = frames.pop() ?? ''
            for (const frame of frames) {
              let dataLine = ''
              let eventName = ''
              for (const rawLine of frame.split('\n')) {
                const line = rawLine.replace(/\r$/, '')
                if (line.startsWith('event:')) eventName = line.slice(6).trim()
                else if (line.startsWith('data:')) dataLine += (dataLine ? '\n' : '') + line.slice(5).trim()
              }
              if (!dataLine || eventName === 'CONNECTED') continue
              try {
                const parsed = JSON.parse(dataLine) as RealtimeEvent
                dispatch(parsed)
              } catch { /* ignore malformed frame */ }
            }
          }
        } catch {
          // reconnect with backoff
        }
        setConnected(false)
        if (stopped) break
        await new Promise((r) => setTimeout(r, backoff))
        backoff = Math.min(backoff * 2, 15000)
      }
    }

    void connect()
    return () => {
      stopped = true
      abort?.abort()
      setConnected(false)
    }
  }, [user, refreshUnreads])

  const { totalMentions, totalDmUnreads } = useMemo(() => {
    let mentions = 0
    let dmUnreads = 0
    Object.values(unreads).forEach((u) => {
      mentions += u.mentionCount
      if (!u.communityId) dmUnreads += u.unreadCount
    })
    return { totalMentions: mentions, totalDmUnreads: dmUnreads }
  }, [unreads])

  const value = useMemo<RealtimeApi>(() => ({
    connected, subscribe, unreads, totalMentions, totalDmUnreads, refreshUnreads, markRead,
    prefs, refreshPrefs, savePrefs, setChannelLevel, toasts, dismissToast, drawerOpen, setDrawerOpen,
  }), [connected, subscribe, unreads, totalMentions, totalDmUnreads, refreshUnreads, markRead,
    prefs, refreshPrefs, savePrefs, setChannelLevel, toasts, dismissToast, drawerOpen])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

const NOOP_ASYNC = async () => undefined
const FALLBACK: RealtimeApi = {
  connected: false,
  subscribe: () => () => undefined,
  unreads: {},
  totalMentions: 0,
  totalDmUnreads: 0,
  refreshUnreads: NOOP_ASYNC,
  markRead: NOOP_ASYNC,
  prefs: null,
  refreshPrefs: NOOP_ASYNC,
  savePrefs: NOOP_ASYNC,
  setChannelLevel: NOOP_ASYNC,
  toasts: [],
  dismissToast: () => undefined,
  drawerOpen: false,
  setDrawerOpen: () => undefined,
}

export function useRealtime(): RealtimeApi {
  return useContext(Ctx) ?? FALLBACK
}
