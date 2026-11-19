import { api } from './client'

export type ChannelNotifLevel = 'ALL' | 'MENTIONS' | 'MUTE'

export interface ChannelUnread {
  channelId: string
  communityId: string | null
  unreadCount: number
  mentionCount: number
  lastReadMessageId: string | null
}

export interface MentionItem {
  id: string
  messageId: string
  channelId: string
  communityId: string | null
  channelName: string
  communityName: string | null
  authorName: string
  excerpt: string
  mentionKind: 'USER' | 'ROLE' | 'EVERYONE'
  label: string
  createdAt: string
  unread: boolean
}

export interface NotificationPrefs {
  dndEnabled: boolean
  dndStart: string | null
  dndEnd: string | null
  showToasts: boolean
  dndActiveNow: boolean
  channelLevels: Record<string, ChannelNotifLevel>
}

export const markChannelRead = async (channelId: string, messageId?: string) => {
  await api.post(`/channels/${channelId}/read`, messageId ? { messageId } : {})
}

export const listUnreads = async () => (await api.get<ChannelUnread[]>('/me/unreads')).data
export const listMentions = async (limit = 50) => (await api.get<MentionItem[]>('/me/mentions', { params: { limit } })).data
export const getNotificationPrefs = async () => (await api.get<NotificationPrefs>('/me/notification-prefs')).data
export const updateNotificationPrefs = async (b: {
  dndEnabled?: boolean
  dndStart?: string | null
  dndEnd?: string | null
  showToasts?: boolean
}) => (await api.put<NotificationPrefs>('/me/notification-prefs', b)).data
export const setChannelNotificationLevel = async (channelId: string, level: ChannelNotifLevel) =>
  (await api.put<NotificationPrefs>(`/me/notification-prefs/channels/${channelId}`, { level })).data
