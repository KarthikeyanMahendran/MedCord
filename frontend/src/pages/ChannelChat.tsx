import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react'
import { useParams } from 'react-router-dom'
import {
  ArrowUp, Bell, BellOff, FileText, Hash, Megaphone, MessageCircle, Paperclip, Phone, Pin,
  ShieldAlert, ShieldCheck, ShieldOff, Sparkles, UserX, Users, Video, Volume2, X,
} from 'lucide-react'
import { Alert, Avatar, Button, EmptyState, FormGroup, Modal, Textarea, VerifiedMark } from '../components/ui'
import { PresenceDot } from '../components/chat/PresenceDot'
import { MessageItem } from '../components/chat/MessageItem'
import { ThreadPanel } from '../components/chat/ThreadPanel'
import { VoiceRecorder } from '../components/chat/VoiceRecorder'
import type { RecordedVoiceNote } from '../components/chat/VoiceRecorder'
import { VoiceRoomPanel } from '../components/call/VoiceRoomPanel'
import { getCommunity, listChannels, listMembers, listRoles } from '../api/communities'
import type { Channel, Community, Member, Role } from '../api/communities'
import { invokeCopilot } from '../api/copilot'
import type { CopilotMode } from '../api/copilot'
import { blockUser, getCachedDm, getDm, unblockUser } from '../api/dms'
import type { Conversation } from '../api/dms'
import {
  deleteMessage, editMessage, getMessage, listMessages, listPins, messageHistory,
  pinMessage, react, sendMessage, sendTyping, startThread, unpinMessage, unreact, uploadAttachment,
} from '../api/messages'
import type { Attachment, Message, Revision } from '../api/messages'
import { REPORT_REASONS, reportMessage } from '../api/moderation'
import type { ReportReason } from '../api/moderation'
import { getSafetyPolicy } from '../api/safety'
import type { SafetyPolicy } from '../api/safety'
import { getVoiceRoom } from '../api/voiceRooms'
import type { VoiceRoom } from '../api/voiceRooms'
import type { ChannelNotifLevel } from '../api/notifications'
import { problemMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useCall } from '../context/CallContext'
import { MicButton } from '../components/VoiceField'
import { useRealtime } from '../context/RealtimeContext'
import { attachNexconnFeatureListener } from '../utils/nexconnFeatures'
import { PHI_CATEGORY_LABELS, scanPhi } from '../utils/phiDetector'

const FALLBACK_POLL_MS = 60000
const TYPING_TTL_MS = 4000
const dayKey = (iso: string) => new Date(iso).toDateString()
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
const GROUP_WINDOW_MS = 5 * 60 * 1000
const ALLOWED_EXT_RE = /\.(png|jpe?g|gif|webp|pdf|webm|ogg|wav|mp3|m4a)$/i
const DICOM_EXT_RE = /\.(dcm|dicom)$/i

interface MentionCandidate {
  key: string
  insert: string
  label: string
  sub: string
  kind: 'USER' | 'ROLE' | 'EVERYONE' | 'AI'
}

const channelMessageCache = new Map<string, { items: Message[]; hasMore: boolean }>()

/** Message pane for a community channel (`/communities/:id/channels/:channelId`) or a DM (`/messages/:channelId`). The sidebar lives in the app shell. */
export default function ChannelChat() {
  const { id = '', channelId = '' } = useParams()
  const dmMode = !id
  const { user } = useAuth()
  const calls = useCall()
  const realtime = useRealtime()

  const [community, setCommunity] = useState<Community | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [showMembers, setShowMembers] = useState(true)
  const [conv, setConv] = useState<Conversation | null>(() => (dmMode && channelId ? (getCachedDm?.(channelId) ?? null) : null))
  const [voiceRoom, setVoiceRoom] = useState<VoiceRoom | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(!!channelId)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)
  const [sending, setSending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null)
  const [openThread, setOpenThread] = useState<string | null>(null)
  const [pins, setPins] = useState<Message[] | null>(null)
  const [reporting, setReporting] = useState<Message | null>(null)
  const [reason, setReason] = useState<ReportReason>('PHI')
  const [details, setDetails] = useState('')
  const [history, setHistory] = useState<{ msg: Message; revs: Revision[] } | null>(null)

  // Real-time typing indicators, unread divider, attachments, mention autocomplete
  const [typers, setTypers] = useState<Record<string, { name: string; until: number }>>({})
  const [unreadAnchorId, setUnreadAnchorId] = useState<string | null>(null)
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  // Clinical Co-Pilot (StreamMessage) & Pre-Send PHI Privacy Shield
  const [copilotBusy, setCopilotBusy] = useState(false)
  const [streamingIds, setStreamingIds] = useState<Record<string, boolean>>({})
  const [safetyPolicy, setSafetyPolicy] = useState<SafetyPolicy | null>(null)

  const scroller = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const stick = useRef(true)
  const lastTypingSent = useRef(0)

  const channel = channels.find((c) => c.id === channelId)
  const isVoice = !dmMode && channel?.type === 'VOICE'
  const perms = dmMode ? ['SEND_MESSAGES'] : (community?.myPermissions ?? [])
  const canPost = dmMode
    ? !!conv && !conv.blockedByMe && !conv.blockedByThem
    : !!channel && !channel.archived && perms.includes('SEND_MESSAGES') && (channel.type !== 'ANNOUNCEMENT' || perms.includes('POST_ANNOUNCEMENTS'))
  const moderator = !dmMode && perms.includes('MODERATE_MESSAGES')
  const canMentionEveryone = !dmMode && (perms.includes('POST_ANNOUNCEMENTS') || perms.includes('MODERATE_MESSAGES') || perms.includes('MANAGE_COMMUNITY'))
  const otherPerson = conv && !conv.group ? conv.participants.find((p) => p.id !== user?.id) : undefined
  const channelNotifLevel: ChannelNotifLevel = (channelId && realtime.prefs?.channelLevels?.[channelId]) || 'ALL'

  useEffect(() => {
    if (dmMode) { setSafetyPolicy(null); return }
    Promise.all([getCommunity(id), listChannels(id)])
      .then(([c, ch]) => { setCommunity(c); setChannels(ch) })
      .catch((e) => setError(problemMessage(e)))
    if (typeof listRoles === 'function') {
      Promise.resolve(listRoles(id)).then((r) => { if (Array.isArray(r)) setRoles(r) }).catch(() => undefined)
    }
    if (typeof getSafetyPolicy === 'function') {
      Promise.resolve(getSafetyPolicy(id)).then((p) => { if (p && typeof p === 'object') setSafetyPolicy(p) }).catch(() => undefined)
    }
  }, [id, dmMode])

  useEffect(() => {
    if (dmMode) return
    const load = () => listMembers(id).then((m) => { if (Array.isArray(m)) setMembers(m) }).catch(() => undefined)
    void load()
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, 30000)
    return () => clearInterval(t)
  }, [id, dmMode])

  useEffect(() => {
    if (!dmMode || !channelId) { setConv(null); return }
    const cached = getCachedDm?.(channelId)
    if (cached) setConv(cached)
    getDm(channelId).then(setConv).catch((e) => setError(problemMessage(e)))
  }, [dmMode, channelId])

  useEffect(() => {
    if (!isVoice || !channelId) { setVoiceRoom(null); return }
    getVoiceRoom(channelId).then(setVoiceRoom).catch(() => undefined)
  }, [isVoice, channelId])

  async function toggleBlock() {
    if (!otherPerson || !conv) return
    try {
      await (conv.blockedByMe ? unblockUser(otherPerson.id) : blockUser(otherPerson.id))
      setConv(await getDm(conv.id)); setError(null)
    } catch (e) { setError(problemMessage(e)) }
  }

  /** Merge a fresh page into state by id (new messages append; edits/deletes replace). */
  const merge = useCallback((incoming: Message[]) => {
    setMessages((prev) => {
      const valid = incoming.filter(Boolean)
      if (valid.length === 0) return prev
      const map = new Map(prev.map((m) => [m.id, m]))
      let hasChanges = false
      for (const m of valid) {
        const old = map.get(m.id)
        if (!old || old.body !== m.body || old.editedAt !== m.editedAt || old.deleted !== m.deleted || old.pinned !== m.pinned || JSON.stringify(old.reactions) !== JSON.stringify(m.reactions)) {
          map.set(m.id, m)
          hasChanges = true
        }
      }
      if (!hasChanges) return prev
      return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    })
  }, [])

  // Load initial messages, snapshot unread divider anchor, and subscribe to real-time SSE events
  useEffect(() => {
    const cached = channelId ? channelMessageCache.get(channelId) : null
    if (cached) {
      setMessages(cached.items)
      setHasMore(cached.hasMore)
      setLoading(false)
    } else {
      setMessages([])
      setLoading(!!channelId)
    }
    setReplyTo(null); setEditing(null); setOpenThread(null)
    setText(''); setNotice(null); setPendingAttachments([]); setTypers({})
    setMentionQuery(null); stick.current = true
    if (!channelId) { setUnreadAnchorId(null); return }

    const initialUnread = realtime.unreads[channelId]
    setUnreadAnchorId(initialUnread && initialUnread.unreadCount > 0 ? initialUnread.lastReadMessageId : null)

    let alive = true
    listMessages(channelId)
      .then((p) => {
        if (!alive) return
        channelMessageCache.set(channelId, { items: p.items, hasMore: p.hasMore })
        setMessages(p.items); setHasMore(p.hasMore); setError(null)
        const latest = p.items[p.items.length - 1]
        if (latest) void realtime.markRead(channelId, latest.id)
      })
      .catch((e) => alive && setError(problemMessage(e)))
      .finally(() => alive && setLoading(false))

    const unsub = realtime.subscribe((ev) => {
      if (ev.channelId !== channelId) return
      if (ev.type === 'MESSAGE_DELETED') {
        const deletedId = String(ev.payload.messageId ?? '')
        if (deletedId) {
          setMessages((prev) => prev.map((m) => m.id === deletedId ? { ...m, deleted: true, body: null, reactions: [] } : m))
        }
      } else if (ev.type === 'MESSAGE_CREATED' || ev.type === 'MESSAGE_UPDATED') {
        const msgId = String(ev.payload.messageId ?? '')
        if (msgId) {
          getMessage(msgId).then((incoming) => {
            if (!alive || !incoming) return
            if (incoming.author.id !== user?.id) {
              setUnreadAnchorId((prevAnchor) => prevAnchor || (messages.length > 0 ? messages[messages.length - 1].id : null))
            }
            merge([incoming])
            if (stick.current && document.visibilityState !== 'hidden') {
              void realtime.markRead(channelId, incoming.id)
            }
          }).catch(() => {
            // Fall back to batch list only if single get fails
            listMessages(channelId).then((p) => {
              if (!alive) return
              merge(p.items)
            }).catch(() => undefined)
          })
        }
      } else if (ev.type === 'AI_STREAM_INIT' || ev.type === 'AI_STREAM_DELTA' || ev.type === 'AI_STREAM_COMPLETE') {
        const msgId = String(ev.payload.messageId ?? '')
        const thId = ev.payload.threadId ? String(ev.payload.threadId) : null
        const content = typeof ev.payload.content === 'string' ? ev.payload.content : ''
        const completed = Boolean(ev.payload.completed) || ev.type === 'AI_STREAM_COMPLETE'
        if (!msgId || thId) return
        setStreamingIds((prev) => {
          if (completed) {
            if (!prev[msgId]) return prev
            const next = { ...prev }
            delete next[msgId]
            return next
          }
          return prev[msgId] ? prev : { ...prev, [msgId]: true }
        })
        if (content) {
          setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, body: content } : m)))
        }
      } else if (ev.type === 'TYPING') {
        const uid = String(ev.payload.userId ?? '')
        const name = String(ev.payload.displayName ?? '')
        if (uid && uid !== user?.id && name) {
          setTypers((prev) => ({ ...prev, [uid]: { name, until: Date.now() + TYPING_TTL_MS } }))
        }
      } else if (ev.type === 'VOICE_ROOM_UPDATED') {
        setVoiceRoom(ev.payload as unknown as VoiceRoom)
      }
    })

    const unsubNexconn = attachNexconnFeatureListener({
      onStreamDelta: () => {
        // Native Nexconn StreamMessage hook active alongside SSE
      },
    })

    // Safety fallback poll only if SSE is disconnected
    const fallback = setInterval(() => {
      if (!realtime.connected && document.visibilityState !== 'hidden') {
        listMessages(channelId).then((p) => alive && merge(p.items)).catch(() => undefined)
      }
    }, FALLBACK_POLL_MS)

    return () => { alive = false; unsub(); unsubNexconn(); clearInterval(fallback) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, merge, user?.id])

  // Expire stale typing indicators
  useEffect(() => {
    if (Object.keys(typers).length === 0) return
    const t = setInterval(() => {
      const now = Date.now()
      setTypers((prev) => {
        const next: Record<string, { name: string; until: number }> = {}
        let changed = false
        for (const [k, v] of Object.entries(prev)) {
          if (v.until > now) next[k] = v
          else changed = true
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(t)
  }, [typers])

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages])

  // Auto-grow the composer up to its max height.
  useLayoutEffect(() => {
    const el = composer.current
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 180)}px` }
  }, [text])

  // Mention autocomplete candidates
  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    const list: MentionCandidate[] = []
    if ('ai'.startsWith(q) || 'copilot'.startsWith(q) || 'clinical'.includes(q) || q === '' || q.startsWith('ai')) {
      const sub = q.replace(/^ai\s*/, '').trim()
      const aiCmds: MentionCandidate[] = [
        {
          key: 'ai-summarize',
          insert: '@ai summarize ',
          label: '@ai summarize',
          sub: 'Summarize active case discussion into a concise clinical brief',
          kind: 'AI',
        },
        {
          key: 'ai-differential',
          insert: '@ai differential ',
          label: '@ai differential',
          sub: 'Generate top 3 differential diagnoses based on discussion',
          kind: 'AI',
        },
        {
          key: 'ai-question',
          insert: '@ai ',
          label: '@ai <question>',
          sub: 'Ask any specific clinical, dosage, or drug interaction question',
          kind: 'AI',
        },
      ]
      aiCmds.filter((c) => !sub || c.label.toLowerCase().includes(sub) || c.sub.toLowerCase().includes(sub)).forEach((c) => list.push(c))
    }
    if (canMentionEveryone && 'everyone'.includes(q)) {
      list.push({ key: 'everyone', insert: '@everyone ', label: '@everyone', sub: 'Notify all community members', kind: 'EVERYONE' })
    }
    if (!dmMode) {
      roles.filter((r) => r.name !== 'Member' && r.name.toLowerCase().includes(q)).forEach((r) => {
        list.push({ key: `role-${r.id}`, insert: `@${r.name} `, label: `@${r.name}`, sub: 'Role', kind: 'ROLE' })
      })
      members.filter((m) => m.userId !== user?.id && m.displayName.toLowerCase().includes(q)).forEach((m) => {
        list.push({ key: `user-${m.userId}`, insert: `@${m.displayName} `, label: `@${m.displayName}`, sub: m.specialty ?? 'Member', kind: 'USER' })
      })
    } else if (conv) {
      conv.participants.filter((p) => p.id !== user?.id && p.displayName.toLowerCase().includes(q)).forEach((p) => {
        list.push({ key: `user-${p.id}`, insert: `@${p.displayName} `, label: `@${p.displayName}`, sub: p.specialty ?? 'Participant', kind: 'USER' })
      })
    }
    return list.slice(0, 8)
  }, [mentionQuery, canMentionEveryone, dmMode, roles, members, conv, user?.id])

  function updateComposerText(val: string) {
    setText(val)
    // Detect trailing @query for mention autocomplete
    const match = val.match(/(?:^|\s)@([^\s@]{0,30})$/)
    if (match) {
      setMentionQuery(match[1])
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
    // Emit throttled typing indicator
    if (channelId && val.trim() && !editing && Date.now() - lastTypingSent.current > 2500) {
      lastTypingSent.current = Date.now()
      if (typeof sendTyping === 'function') Promise.resolve(sendTyping(channelId)).catch(() => undefined)
    }
  }

  function applyMention(c: MentionCandidate) {
    const replaced = text.replace(/(^|\s)@[^\s@]{0,30}$/, `$1${c.insert}`)
    setText(replaced)
    setMentionQuery(null)
    composer.current?.focus()
  }

  async function loadOlder() {
    if (messages.length === 0) return
    const el = scroller.current
    const prevHeight = el?.scrollHeight ?? 0
    try {
      const p = await listMessages(channelId, messages[0].id)
      stick.current = false
      merge(p.items); setHasMore(p.hasMore)
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight })
    } catch (e) { setError(problemMessage(e)) }
  }

  async function handleFiles(files: FileList | File[]) {
    if (!channelId || !canPost || editing) return
    const list = Array.from(files)
    if (list.length === 0) return
    if (pendingAttachments.length + list.length > 5) {
      setError('You can attach up to 5 files per message.')
      return
    }
    setError(null)
    setUploading(true)
    try {
      for (const file of list) {
        if (DICOM_EXT_RE.test(file.name) || file.type.toLowerCase().includes('dicom')) {
          setError('DICOM files are blocked to prevent patient data (PHI) exposure. Upload de-identified PNG, JPEG, or PDF files only.')
          continue
        }
        if (!ALLOWED_EXT_RE.test(file.name) && !/^image\/(jpeg|png|gif|webp)$|^application\/pdf$|^audio\/(webm|ogg|wav|mpeg|mp4)$/i.test(file.type)) {
          setError(`Unsupported file "${file.name}". Allowed: JPEG, PNG, GIF, WebP, PDF, and voice notes.`)
          continue
        }
        if (file.size > 10 * 1024 * 1024) {
          setError(`"${file.name}" exceeds the 10 MB limit.`)
          continue
        }
        const uploaded = await uploadAttachment(channelId, file)
        setPendingAttachments((prev) => [...prev, uploaded])
      }
    } catch (e) {
      setError(problemMessage(e))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) void handleFiles(e.target.files)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files)
  }

  const blockedTerms = useMemo(
    () => safetyPolicy?.blockedTerms?.map((t) => t.term) ?? [],
    [safetyPolicy],
  )

  const phiScan = useMemo(() => {
    if (safetyPolicy?.phiMode === 'OFF') {
      return { hasPhi: false, findings: [], categories: [], redactedText: text }
    }
    return scanPhi(text, blockedTerms)
  }, [text, blockedTerms, safetyPolicy?.phiMode])

  const strictPhiBlocked = safetyPolicy?.phiMode === 'STRICT_BLOCK' && !safetyPolicy.autoRedact && phiScan.hasPhi

  async function runCopilot(mode: CopilotMode, prompt?: string) {
    if (!channelId || copilotBusy) return
    setCopilotBusy(true)
    setError(null)
    try {
      stick.current = true
      const res = await invokeCopilot(channelId, { mode, prompt })
      if (res.message) {
        merge([res.message])
        setStreamingIds((prev) => ({ ...prev, [res.message.id]: true }))
      }
    } catch (e) {
      setError(problemMessage(e))
    } finally {
      setCopilotBusy(false)
    }
  }

  async function handleVoiceSend(note: RecordedVoiceNote) {
    if (!channelId || !canPost) return
    setUploading(true)
    setError(null)
    try {
      const uploaded = await uploadAttachment(channelId, note.file, {
        durationSeconds: note.durationSeconds,
        transcript: note.transcript || undefined,
      })
      stick.current = true
      const sent = await sendMessage(channelId, '', replyTo?.id, [uploaded.id])
      merge([sent])
      setReplyTo(null)
      setUnreadAnchorId(null)
    } catch (e) {
      setError(problemMessage(e))
    } finally {
      setUploading(false)
    }
  }

  async function submit(forceAutoRedact = false) {
    const rawBody = text.trim()
    const attIds = pendingAttachments.map((a) => a.id)
    if ((!rawBody && attIds.length === 0) || sending || uploading) return

    // Slash command shortcut: /ai <question> or /copilot <question>
    const isSlashAi = !editing && /^\/(?:ai|copilot)(?:\s+|$)/i.test(rawBody)
    if (isSlashAi) {
      const q = rawBody.replace(/^\/(?:ai|copilot)\s*/i, '').trim()
      setText('')
      let mode: CopilotMode = 'ASK'
      let prompt: string | undefined = q || undefined
      if (!q || /^(summarize|summary|sbar)$/i.test(q)) {
        mode = 'SUMMARIZE'
        prompt = undefined
      } else if (/^(differential|ddx)$/i.test(q)) {
        mode = 'DIFFERENTIAL'
        prompt = undefined
      }
      await runCopilot(mode, prompt)
      return
    }

    const body = forceAutoRedact ? phiScan.redactedText.trim() : rawBody
    setSending(true); setError(null)
    try {
      if (editing) {
        merge([await editMessage(editing.id, body)]); setEditing(null)
        setText('')
        setMentionQuery(null)
      } else {
        const tempId = `temp-${Date.now()}`
        const optimisticMsg: Message = {
          id: tempId,
          channelId,
          author: {
            id: user?.id ?? '',
            displayName: user?.displayName ?? 'You',
            specialty: user?.specialty ?? null,
            verified: user?.verificationStatus === 'APPROVED',
          },
          body,
          createdAt: new Date().toISOString(),
          editedAt: null,
          deleted: false,
          replyTo: replyTo ? {
            id: replyTo.id,
            authorName: replyTo.author.displayName,
            excerpt: replyTo.body ? (replyTo.body.length <= 100 ? replyTo.body : replyTo.body.substring(0, 100) + '…') : null,
            deleted: replyTo.deleted,
          } : null,
          thread: null,
          threadId: null,
          reactions: [],
          pinned: false,
          kind: 'TEXT',
          attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
        }

        // Optimistically show message immediately
        stick.current = true
        setMessages((prev) => [...prev, optimisticMsg])
        setText('')
        setReplyTo(null)
        setPendingAttachments([])
        setUnreadAnchorId(null)
        setMentionQuery(null)

        try {
          const sent = forceAutoRedact
            ? await sendMessage(channelId, body, replyTo?.id, attIds.length > 0 ? attIds : undefined, true)
            : attIds.length > 0
              ? await sendMessage(channelId, body, replyTo?.id, attIds)
              : await sendMessage(channelId, body, replyTo?.id)
          if (sent) {
            setMessages((prev) => prev.map((m) => (m.id === tempId ? sent : m)))
          }

          // If message summons AI via @ai or @copilot
          if (/(?:^|\s)@(ai|copilot)\b/i.test(body)) {
            const q = body.replace(/(?:^|\s)@(ai|copilot)\b/gi, '').trim()
            let mode: CopilotMode = 'ASK'
            let prompt: string | undefined = q || undefined
            if (!q || /^(summarize|summary|sbar)$/i.test(q)) {
              mode = 'SUMMARIZE'
              prompt = undefined
            } else if (/^(differential|ddx)$/i.test(q)) {
              mode = 'DIFFERENTIAL'
              prompt = undefined
            }
            void runCopilot(mode, prompt)
          }
        } catch (err) {
          // Revert optimistic message if send failed
          setMessages((prev) => prev.filter((m) => m.id !== tempId))
          setText(rawBody)
          throw err
        }
      }
    } catch (e) { setError(problemMessage(e)) } finally { setSending(false) }
  }

  function startEdit(m: Message) { setEditing(m); setReplyTo(null); setText(m.body ?? ''); composer.current?.focus() }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionCandidates.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyMention(mentionCandidates[mentionIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!strictPhiBlocked) void submit(false) }
    else if (e.key === 'Escape') { setEditing(null); setReplyTo(null); setText('') }
    else if (e.key === 'ArrowUp' && text === '' && !editing) {
      const mine = [...messages].reverse().find((m) => m.author.id === user?.id && !m.deleted)
      if (mine) { e.preventDefault(); startEdit(mine) }
    }
  }

  async function doDelete() {
    if (!confirmDelete) return
    try { await deleteMessage(confirmDelete.id); merge([{ ...confirmDelete, deleted: true, body: null }]); setConfirmDelete(null) }
    catch (e) { setError(problemMessage(e)); setConfirmDelete(null) }
  }

  async function showHistory(m: Message) {
    try { setHistory({ msg: m, revs: await messageHistory(m.id) }) } catch (e) { setError(problemMessage(e)) }
  }

  const refreshTimeline = useCallback(() => { listMessages(channelId).then((p) => merge(p.items)).catch(() => undefined) }, [channelId, merge])

  async function openOrStartThread(m: Message) {
    if (m.thread) { setOpenThread(m.thread.id); return }
    try {
      const t = await startThread(m.id)
      merge([{ ...m, thread: { id: t.id, title: t.title, replyCount: 0, lastReplyAt: null, archived: false } }])
      setOpenThread(t.id)
    } catch (e) { setError(problemMessage(e)) }
  }

  async function toggleReaction(m: Message, emoji: string) {
    const had = m.reactions.some((r) => r.emoji === emoji && r.mine)
    try { merge([await (had ? unreact(m.id, emoji) : react(m.id, emoji))]) } catch (e) { setError(problemMessage(e)) }
  }

  async function togglePin(m: Message) {
    try { merge([await (m.pinned ? unpinMessage(m.id) : pinMessage(m.id))]) } catch (e) { setError(problemMessage(e)) }
  }

  async function cycleChannelNotif() {
    if (!channelId) return
    const next: ChannelNotifLevel = channelNotifLevel === 'ALL' ? 'MENTIONS' : channelNotifLevel === 'MENTIONS' ? 'MUTE' : 'ALL'
    try {
      await realtime.setChannelLevel(channelId, next)
      setNotice(next === 'MUTE' ? 'Channel muted (unreads still tracked).' : next === 'MENTIONS' ? 'Notifications set to mentions only.' : 'Notifications set to all messages.')
    } catch (e) { setError(problemMessage(e)) }
  }

  async function showPins() {
    try { setPins(await listPins(channelId)) } catch (e) { setError(problemMessage(e)) }
  }

  async function submitReport() {
    if (!reporting) return
    try { await reportMessage(reporting.id, reason, details || undefined); setNotice('Thanks — moderators will review this message.'); setReporting(null); setDetails('') }
    catch (e) { setError(problemMessage(e)); setReporting(null) }
  }

  const rows = useMemo(() => {
    let lastDay = ''
    const anchorIndex = unreadAnchorId ? messages.findIndex((m) => m.id === unreadAnchorId) : -1
    const firstUnreadIndex = anchorIndex >= 0 && anchorIndex < messages.length - 1 ? anchorIndex + 1 : -1

    return messages.map((m, i) => {
      const k = dayKey(m.createdAt)
      const header = k !== lastDay
      lastDay = k
      const unreadDivider = i === firstUnreadIndex
      const isUnread = firstUnreadIndex >= 0 && i >= firstUnreadIndex && m.author.id !== user?.id
      const prev = messages[i - 1]
      const compact = !header && !unreadDivider && !!prev && prev.author.id === m.author.id && !prev.deleted && !m.replyTo && !prev.thread
        && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS
      return { m, header, compact, unreadDivider, isUnread }
    })
  }, [messages, unreadAnchorId, user?.id])

  const online = members.filter((m) => m.online)
  const offline = members.filter((m) => !m.online)
  const memberRow = (m: Member) => (
    <div key={m.userId} className={`mc-member ${m.online ? '' : 'is-offline'}`}>
      <span className="mc-member-avatar"><Avatar name={m.displayName} size="sm" /><PresenceDot online={m.online} /></span>
      <span style={{ minWidth: 0 }}>
        <span className="mc-member-name"><span>{m.displayName}</span>{m.verified && <VerifiedMark size={13} />}</span>
        <span className="mc-member-sub">{m.roles.find((r) => r.name !== 'Member')?.name ?? m.specialty ?? ''}</span>
      </span>
    </div>
  )

  const typingNames = Object.values(typers).map((t) => t.name)
  const typingText = typingNames.length === 1 ? `${typingNames[0]} is typing…`
    : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing…`
      : typingNames.length > 2 ? `${typingNames[0]} and ${typingNames.length - 1} others are typing…` : null

  return (
    <div
      className={`mc-chat ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(e) => { if (canPost && !editing) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <section className="mc-chat-main">
        <div className="mc-chat-head">
          <div className="mc-chat-title">
            {dmMode
              ? (<>{otherPerson
                    ? <span className="mc-member-avatar"><Avatar name={otherPerson.displayName} size="sm" /><PresenceDot online={otherPerson.online} /></span>
                    : conv ? <Users size={18} /> : <MessageCircle size={18} />}
                  <strong>{conv?.name ?? (channelId ? '…' : 'Direct messages')}</strong>
                  {otherPerson?.verified && <VerifiedMark />}
                  {otherPerson && <span className="mc-chat-topic">{otherPerson.specialty ?? ''}{otherPerson.online ? ' · Online' : ' · Offline'}</span>}
                  {conv?.group && <span className="mc-chat-topic">{conv.participants.length} members</span>}</>)
              : (<>{channel?.type === 'ANNOUNCEMENT' ? <Megaphone size={18} /> : channel?.type === 'VOICE' ? <Volume2 size={18} /> : <Hash size={18} />}<strong>{channel?.name ?? '…'}</strong>
                  {channel?.topic && <span className="mc-chat-topic">{channel.topic}</span>}</>)}
          </div>
          <div className="mc-chat-actions">
            {dmMode && otherPerson && conv && (() => {
              const why = conv.blockedByMe || conv.blockedByThem ? 'Calling is unavailable in this conversation'
                : !calls.ready ? 'Calling is connecting…' : calls.state.phase !== 'idle' ? 'You are already in a call' : null
              return (<>
                <Button variant="icon" aria-label="Start voice call" title={why ?? 'Start voice call'} disabled={!!why} onClick={() => calls.startCall(conv.id, 'AUDIO')}><Phone size={17} /></Button>
                <Button variant="icon" aria-label="Start video call" title={why ?? 'Start video call'} disabled={!!why} onClick={() => calls.startCall(conv.id, 'VIDEO')}><Video size={18} /></Button>
              </>)
            })()}
            {dmMode && otherPerson && <Button variant="ghost" size="sm" onClick={toggleBlock}>{conv?.blockedByMe ? <><ShieldOff size={14} /> Unblock</> : <><UserX size={14} /> Block</>}</Button>}
            {channelId && (
              <Button variant="icon" aria-label={`Channel notifications: ${channelNotifLevel.toLowerCase()}`}
                title={`Notifications: ${channelNotifLevel === 'MUTE' ? 'Muted' : channelNotifLevel === 'MENTIONS' ? 'Mentions only' : 'All'} (click to cycle)`}
                onClick={cycleChannelNotif}>
                {channelNotifLevel === 'MUTE' ? <BellOff size={16} /> : <Bell size={16} />}
              </Button>
            )}
            {channelId && <Button variant="icon" aria-label="Pinned" title="Pinned messages" onClick={showPins}><Pin size={17} /></Button>}
            {!dmMode && <Button variant="icon" aria-label={showMembers ? 'Hide member list' : 'Show member list'} aria-pressed={showMembers} onClick={() => setShowMembers((v) => !v)}><Users size={17} /></Button>}
          </div>
        </div>

        {isVoice && channelId && <VoiceRoomPanel channelId={channelId} roomSnapshot={voiceRoom} />}

        <div className="mc-msgs" ref={scroller} onScroll={(e) => {
          const el = e.currentTarget
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          stick.current = atBottom
          if (atBottom && channelId && messages.length > 0 && realtime.unreads[channelId]?.unreadCount > 0) {
            void realtime.markRead(channelId, messages[messages.length - 1].id)
          }
        }} role="log" aria-live="polite" aria-label="Messages">
          {hasMore && <div style={{ textAlign: 'center' }}><Button variant="ghost" size="sm" onClick={loadOlder}>Load earlier messages</Button></div>}
          {loading && [0, 1, 2].map((i) => (
            <div key={i} className="mc-msg-skel" aria-hidden="true">
              <span className="mc-skeleton is-avatar" />
              <span style={{ display: 'grid', gap: 8, paddingTop: 4 }}><span className="mc-skeleton" style={{ width: 140 }} /><span className="mc-skeleton" style={{ width: `${70 - i * 15}%` }} /></span>
            </div>
          ))}
          {!channelId && dmMode && (
            <div style={{ margin: 'auto' }}>
              <EmptyState title="No conversation selected" icon={<MessageCircle size={18} />}>Pick a conversation on the left, or message a colleague from any community&apos;s member list.</EmptyState>
            </div>
          )}
          {rows.map(({ m, header, compact, unreadDivider, isUnread }) => (
            <div key={m.id}>
              {header && <div className="mc-day">{dayLabel(m.createdAt)}</div>}
              {unreadDivider && <div className="mc-unread-divider" role="separator"><span>New messages</span></div>}
              <MessageItem m={m} compact={compact} streaming={!!streamingIds[m.id]} userId={user?.id} canPost={canPost} moderator={dmMode ? true : moderator}
                isUnread={isUnread}
                onReply={(x) => { setReplyTo(x); setEditing(null); composer.current?.focus() }} onEdit={startEdit} onDelete={setConfirmDelete}
                onHistory={showHistory} onThread={openOrStartThread} onReact={toggleReaction} onPin={togglePin}
                onReport={dmMode ? undefined : setReporting} />
            </div>
          ))}
        </div>

        <div className="mc-composer">
          {typingText && (
            <div className="mc-typing-bar" aria-live="polite">
              <span className="mc-typing-dots" aria-hidden="true"><i /><i /><i /></span>
              <span>{typingText}</span>
            </div>
          )}
          {notice && <Alert tone="success">{notice}</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}
          {phiScan.hasPhi && (
            <div className={`mc-phi-shield ${strictPhiBlocked ? 'is-strict' : ''}`} role="alert" aria-label="PHI leak warning">
              <div className="mc-phi-shield-main">
                <ShieldAlert size={16} />
                <div>
                  <strong>
                    {strictPhiBlocked
                      ? 'Blocked by Clinical Privacy Shield (Strict Mode)'
                      : 'Clinical Privacy Shield — Potential patient data (PHI) detected'}
                  </strong>
                  <div className="mc-phi-chips">
                    {phiScan.categories.map((c) => (
                      <span key={c} className="mc-phi-chip">{PHI_CATEGORY_LABELS[c] ?? c}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mc-phi-shield-actions">
                <Button variant="secondary" size="sm" onClick={() => setText(phiScan.redactedText)}>
                  <ShieldCheck size={13} /> Auto-Redact
                </Button>
                {!editing && (
                  <Button size="sm" loading={sending} onClick={() => void submit(true)}>
                    Redact &amp; Send
                  </Button>
                )}
              </div>
            </div>
          )}
          {pendingAttachments.length > 0 && (
            <div className="mc-pending-atts" aria-label="Pending attachments">
              {pendingAttachments.map((a) => (
                <div key={a.id} className="mc-pending-att">
                  <FileText size={13} />
                  <span className="mc-pending-att-name">{a.filename}</span>
                  {a.exifStripped && <span className="mc-att-exif"><ShieldCheck size={11} /> EXIF stripped</span>}
                  <button type="button" className="mc-pending-att-rm" aria-label={`Remove ${a.filename}`}
                    onClick={() => setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))}><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          {mentionCandidates.length > 0 && (
            <div className="mc-mention-pop" role="listbox" aria-label="Mention suggestions">
              {mentionCandidates.map((c, idx) => (
                <button key={c.key} type="button" role="option" aria-selected={idx === mentionIndex}
                  className={`mc-mention-opt ${idx === mentionIndex ? 'is-selected' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); applyMention(c) }}>
                  <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {c.kind === 'AI' && <Sparkles size={13} style={{ color: 'var(--mc-brand)' }} />}
                    {c.label}
                  </strong>
                  <span className="mc-muted-sub">{c.sub}</span>
                </button>
              ))}
            </div>
          )}
          {replyTo && <div className="mc-composer-bar"><span>Replying to <strong>{replyTo.author.displayName}</strong></span><Button variant="icon" size="sm" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><X size={14} /></Button></div>}
          {editing && <div className="mc-composer-bar"><span>Editing message · Esc to cancel</span><Button variant="icon" size="sm" aria-label="Cancel edit" onClick={() => { setEditing(null); setText('') }}><X size={14} /></Button></div>}
          {dmMode && conv && !canPost && <Alert tone="info">{conv.blockedByMe ? 'You blocked this person. Unblock to send messages.' : 'You can no longer message this person.'}</Alert>}
          {!dmMode && channel && !canPost
            ? <Alert tone="info">{channel.archived ? 'This channel is archived and read-only.' : channel.type === 'ANNOUNCEMENT' ? 'Only members with announcement permission can post here.' : 'You do not have permission to send messages.'}</Alert>
            : (
              <div className="mc-composer-row" hidden={!channelId || (dmMode && !canPost)}>
                {!editing && (
                  <>
                    <input ref={fileInput} type="file" hidden multiple accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,audio/webm,audio/ogg,audio/wav,audio/mpeg,audio/mp4" onChange={onFileInputChange} />
                    <Button variant="icon" size="sm" aria-label="Attach file" title="Attach image, PDF, or audio"
                      disabled={uploading || pendingAttachments.length >= 5} onClick={() => fileInput.current?.click()}>
                      <Paperclip size={16} />
                    </Button>
                    <VoiceRecorder disabled={uploading || sending || !canPost} blockedTerms={blockedTerms} onSend={handleVoiceSend} onError={setError} />
                  </>
                )}
                {canPost && <MicButton inline value={text} onText={updateComposerText} label="Speak your message" />}
                <textarea ref={composer} rows={1} aria-label="Message" placeholder={dmMode ? `Message ${conv?.name ?? ''}` : channel ? `Message #${channel.name}` : 'Message'}
                  value={text} onChange={(e) => updateComposerText(e.target.value)} onKeyDown={onKey}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData.files)
                    if (files.length > 0 && !editing) { e.preventDefault(); void handleFiles(files) }
                  }}
                  maxLength={4000} />
                <Button onClick={() => void submit(false)} loading={sending || uploading} disabled={strictPhiBlocked || (!text.trim() && pendingAttachments.length === 0)} aria-label={editing ? 'Save edit' : 'Send'}><ArrowUp size={16} /></Button>
              </div>
            )}
          {channelId && canPost && (
            <div className="mc-composer-hint" aria-hidden="true">
              <span><b>@ai</b> summon Co-Pilot</span><span><b>/ai</b> assist</span><span><b>**bold**</b> / tables</span><span><b>Enter</b> send</span>{!editing && <span><b>↑</b> edit last</span>}
            </div>
          )}
        </div>
      </section>

      {openThread && <ThreadPanel threadId={openThread} userId={user?.id} canPost={canPost} moderator={moderator} onClose={() => setOpenThread(null)} onChanged={refreshTimeline} />}

      {!dmMode && showMembers && !openThread && (
        <aside className="mc-panel mc-members" aria-label="Members">
          <div className="mc-side-label">Online — {online.length}</div>
          {online.map(memberRow)}
          <div className="mc-side-label">Offline — {offline.length}</div>
          {offline.map(memberRow)}
        </aside>
      )}

      <Modal isOpen={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete message?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={doDelete}>Delete</Button></>}>
        The message will be removed for everyone. A copy is kept for moderation audit.
      </Modal>

      <Modal isOpen={reporting !== null} onClose={() => setReporting(null)} title="Report message" size="sm"
        footer={<><Button variant="secondary" onClick={() => setReporting(null)}>Cancel</Button><Button onClick={submitReport}>Submit report</Button></>}>
        <div style={{ display: 'grid', gap: 12 }}>
          <FormGroup id="rreason" label="Why are you reporting this?">
            <select id="rreason" className="mc-input" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
              {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </FormGroup>
          <FormGroup id="rdetails" label="Details (optional)"><Textarea id="rdetails" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} /></FormGroup>
        </div>
      </Modal>

      <Modal isOpen={pins !== null} onClose={() => setPins(null)} title="Pinned messages" size="md">
        {pins?.length === 0 && <div className="mc-empty"><strong>No pinned messages</strong><p className="mc-hint">Moderators can pin important messages from the message menu.</p></div>}
        <div style={{ display: 'grid', gap: 10 }}>
          {pins?.map((p) => (
            <div key={p.id} className="mc-rev"><div className="mc-muted-sub">{p.author.displayName} · {new Date(p.createdAt).toLocaleString()}</div><div className="mc-msg-body" style={{ marginTop: 4 }}>{p.body}</div></div>
          ))}
        </div>
      </Modal>

      <Modal isOpen={history !== null} onClose={() => setHistory(null)} title="Edit history" size="md">
        <div style={{ display: 'grid', gap: 10 }}>
          {history?.revs.map((r) => (
            <div key={r.revisionNo} className="mc-rev">
              <div className="mc-muted-sub">Version {r.revisionNo} · {r.kind === 'DELETE' ? 'deleted' : 'replaced'} by {r.actorName} · {new Date(r.createdAt).toLocaleString()}</div>
              <div className="mc-msg-body" style={{ marginTop: 4 }}>{r.body}</div>
            </div>
          ))}
          {history && <div className="mc-rev" style={{ borderColor: 'var(--mc-brand)' }}><div className="mc-muted-sub">Current version</div><div className="mc-msg-body" style={{ marginTop: 4 }}>{history.msg.body}</div></div>}
        </div>
      </Modal>
    </div>
  )
}
