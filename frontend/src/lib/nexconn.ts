import { api } from '../api/client'

/**
 * Real-time layer on the Nexconn Chat SDK.
 * MedCord's backend stays the source of truth for messages. Nexconn carries a small "new message" signal
 * between the two people in a case room, so the other side updates the moment a message is sent.
 */
export type NexconnStatus = 'off' | 'connecting' | 'live' | 'failed'

interface ChatToken { appKey: string; userId: string; token: string }
type Chat = typeof import('@nexconn/chat')

const PREFIX = 'medcord:'
let status: NexconnStatus = 'off'
let connecting: Promise<boolean> | null = null
let sdk: Chat | null = null
let myNexconnId: string | null = null
let initialized = false
const beforeConnect = new Map<string, (chat: Chat) => Promise<void> | void>()
const statusListeners = new Set<(s: NexconnStatus) => void>()
const signalListeners = new Set<(channelId: string, from: string) => void>()

const setStatus = (s: NexconnStatus) => { status = s; statusListeners.forEach((f) => f(s)) }
export const nexconnStatus = () => status
/** Other features (calls) register set-up that must run after the SDK starts and before it connects. */
export function beforeNexconnConnect(key: string, fn: (chat: Chat) => Promise<void> | void) { beforeConnect.set(key, fn) }
export const toNexconnId = (uuid: string) => uuid.replace(/-/g, '')

export function onNexconnStatus(cb: (s: NexconnStatus) => void) { statusListeners.add(cb); cb(status); return () => { statusListeners.delete(cb) } }
/** Called when the other person signals a new message in a channel. */
export function onChannelSignal(cb: (channelId: string, from: string) => void) { signalListeners.add(cb); return () => { signalListeners.delete(cb) } }

export function connectNexconn(): Promise<boolean> {
  if (status === 'live') return Promise.resolve(true)
  if (connecting) return connecting
  setStatus('connecting')
  connecting = (async () => {
    try {
      const { data } = await api.get<ChatToken>('/chat/token')
      const mod = await import('@nexconn/chat')
      if (!mod.NCEngine?.initialize || !mod.MessageHandler) throw new Error('Nexconn SDK is not available')
      if (!initialized) { mod.NCEngine.initialize({ appKey: data.appKey, areaCode: mod.AreaCode?.SG }); initialized = true }
      mod.NCEngine.addMessageHandler('medcord', new mod.MessageHandler({
        onMessageReceived: ({ messages }) => {
          for (const m of messages) {
            const text = (m.content as { text?: string } | undefined)?.text
            if (typeof text === 'string' && text.startsWith(PREFIX)) signalListeners.forEach((f) => f(text.slice(PREFIX.length), m.senderUserId))
          }
        },
      }))
      for (const fn of beforeConnect.values()) await fn(mod)
      const res = await mod.NCEngine.connect({ token: data.token })
      if (!res.isOk) throw new Error('Nexconn connect failed')
      sdk = mod; myNexconnId = data.userId
      setStatus('live')
      return true
    } catch (e) {
      console.warn('Nexconn is not connected:', e)
      setStatus('failed')
      return false
    } finally {
      connecting = null
    }
  })()
  return connecting
}

export async function disconnectNexconn() {
  try { await sdk?.NCEngine.disconnect() } catch { /* already gone */ }
  sdk = null; myNexconnId = null
  setStatus('off')
}

/** Tell the other person a new message is waiting in this channel. Best effort: the backend copy is what counts. */
export async function signalPeer(peerUserId: string | null | undefined, channelId: string): Promise<boolean> {
  if (!peerUserId || status !== 'live' || !sdk) return false
  const peer = toNexconnId(peerUserId)
  if (peer === myNexconnId) return false
  try {
    const channel = new sdk.DirectChannel(peer)
    const res = await channel.sendMessage(new sdk.SendTextMessageParams({ text: PREFIX + channelId }))
    return Boolean(res.isOk)
  } catch { return false }
}
