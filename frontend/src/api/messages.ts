import { api } from './client'

export interface Author { id: string; displayName: string; specialty: string | null; verified: boolean }
export interface ReplyPreview { id: string; authorName: string; excerpt: string | null; deleted: boolean }
export interface ReactionCount { emoji: string; count: number; mine: boolean }
export interface ThreadSummary { id: string; title: string | null; replyCount: number; lastReplyAt: string | null; archived: boolean }
export interface Attachment {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
  width: number | null
  height: number | null
  exifStripped: boolean
  url: string
  durationSeconds?: number | null
  transcript?: string | null
  transcriptStatus?: 'NONE' | 'PENDING' | 'COMPLETED' | 'FAILED'
  nexconnMessageId?: string | null
}
export interface Message {
  id: string; channelId: string; author: Author; body: string | null; createdAt: string
  editedAt: string | null; deleted: boolean; replyTo: ReplyPreview | null; thread: ThreadSummary | null; threadId: string | null
  reactions: ReactionCount[]; pinned: boolean
  /** 'CALL' rows are call outcomes; 'AI' rows are streamed Clinical Co-Pilot notes; 'VOICE' are HD voice notes. */
  kind?: 'TEXT' | 'CALL' | 'AI' | 'VOICE'; callId?: string | null
  attachments?: Attachment[]
  bookmarked?: boolean
}
export interface MessagePage { items: Message[]; hasMore: boolean }
export interface Revision { revisionNo: number; kind: 'EDIT' | 'DELETE'; body: string; actorId: string; actorName: string; createdAt: string }
export interface BookmarkItem {
  messageId: string; channelId: string; communityId: string | null
  channelName: string; communityName: string | null
  note: string | null; savedAt: string; message: Message
}

export const listMessages = async (channelId: string, before?: string, limit = 50) =>
  (await api.get<MessagePage>(`/channels/${channelId}/messages`, { params: { before, limit } })).data
export const getMessage = async (id: string) =>
  (await api.get<Message>(`/messages/${id}`)).data
export const sendMessage = async (
  channelId: string,
  body: string,
  replyToId?: string,
  attachmentIds?: string[],
  autoRedact?: boolean,
) => {
  const payload: { body: string; replyToId?: string; attachmentIds?: string[]; autoRedact?: boolean } = { body, replyToId }
  if (attachmentIds && attachmentIds.length > 0) payload.attachmentIds = attachmentIds
  if (autoRedact) payload.autoRedact = true
  return (await api.post<Message>(`/channels/${channelId}/messages`, payload)).data
}
export const editMessage = async (id: string, body: string) => (await api.patch<Message>(`/messages/${id}`, { body })).data
export const deleteMessage = async (id: string) => { await api.delete(`/messages/${id}`) }
export const messageHistory = async (id: string) => (await api.get<Revision[]>(`/messages/${id}/revisions`)).data
export const sendTyping = async (channelId: string) => { await api.post(`/channels/${channelId}/typing`) }

export const uploadAttachment = async (
  channelId: string,
  file: File,
  meta?: { durationSeconds?: number; transcript?: string; nexconnMessageId?: string },
) => {
  const fd = new FormData()
  fd.append('file', file)
  if (meta?.durationSeconds !== undefined) fd.append('durationSeconds', String(meta.durationSeconds))
  if (meta?.transcript) fd.append('transcript', meta.transcript)
  if (meta?.nexconnMessageId) fd.append('nexconnMessageId', meta.nexconnMessageId)
  return (await api.post<Attachment>(`/channels/${channelId}/attachments`, fd)).data
}
export const transcribeAttachment = async (id: string, transcript?: string) =>
  (await api.post<Attachment>(`/attachments/${id}/transcribe`, transcript ? { transcript } : {})).data
export const fetchAttachmentBlob = async (id: string, download = false) =>
  (await api.get<Blob>(`/attachments/${id}`, { params: download ? { download: true } : undefined, responseType: 'blob' })).data

export const bookmarkMessage = async (id: string, note?: string) =>
  (await api.put<Message>(`/messages/${id}/bookmark`, note !== undefined ? { note } : {})).data
export const unbookmarkMessage = async (id: string) => (await api.delete<Message>(`/messages/${id}/bookmark`)).data
export const listBookmarks = async () => (await api.get<BookmarkItem[]>('/me/bookmarks')).data

export interface Thread {
  id: string; channelId: string; rootMessageId: string; title: string | null; archived: boolean
  replyCount: number; lastReplyAt: string | null; createdBy: string; createdAt: string; root: Message
}
export const startThread = async (messageId: string, title?: string) => (await api.post<Thread>(`/messages/${messageId}/thread`, { title })).data
export const getThread = async (id: string) => (await api.get<Thread>(`/threads/${id}`)).data
export const updateThread = async (id: string, b: { title?: string; archived?: boolean }) => (await api.patch<Thread>(`/threads/${id}`, b)).data
export const listThreadMessages = async (id: string, before?: string, limit = 50) =>
  (await api.get<MessagePage>(`/threads/${id}/messages`, { params: { before, limit } })).data
export const replyInThread = async (id: string, body: string, replyToId?: string) =>
  (await api.post<Message>(`/threads/${id}/messages`, { body, replyToId })).data

export const react = async (id: string, emoji: string) => (await api.put<Message>(`/messages/${id}/reactions/${encodeURIComponent(emoji)}`)).data
export const unreact = async (id: string, emoji: string) => (await api.delete<Message>(`/messages/${id}/reactions/${encodeURIComponent(emoji)}`)).data
export const pinMessage = async (id: string) => (await api.put<Message>(`/messages/${id}/pin`)).data
export const unpinMessage = async (id: string) => (await api.delete<Message>(`/messages/${id}/pin`)).data
export const listPins = async (channelId: string) => (await api.get<Message[]>(`/channels/${channelId}/pins`)).data
