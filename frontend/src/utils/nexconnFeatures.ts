/**
 * Bridges optional native @nexconn/chat SDK features (StreamMessage deltas & Speech-to-Text events)
 * and browser SpeechRecognition for zero-latency hands-free voice note transcription.
 * Degrades cleanly whenever Nexconn is offline or blocked behind a hospital firewall.
 */

interface BrowserSpeechRecognitionEvent {
  results: {
    length: number
    [index: number]: {
      isFinal: boolean
      0: { transcript: string }
    }
  }
}

interface BrowserSpeechRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((ev: BrowserSpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition

function getSpeechCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isBrowserSpeechSupported(): boolean {
  return getSpeechCtor() !== null
}

/**
 * Starts live browser speech-to-text alongside MediaRecorder so voice notes
 * arrive with an instant transcript even in offline/firewalled hospital networks.
 */
export function startLiveSpeechCapture(onTranscript: (text: string) => void): () => void {
  const Ctor = getSpeechCtor()
  if (!Ctor) return () => undefined
  try {
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = typeof navigator !== 'undefined' ? (navigator.language || 'en-US') : 'en-US'
    let committed = ''
    rec.onresult = (ev) => {
      let interim = ''
      let finals = ''
      for (let i = 0; i < ev.results.length; i += 1) {
        const seg = ev.results[i]
        const text = seg?.[0]?.transcript ?? ''
        if (seg?.isFinal) finals += `${text} `
        else interim += text
      }
      committed = finals.trim()
      const combined = `${committed} ${interim}`.trim()
      if (combined) onTranscript(combined)
    }
    rec.onerror = () => undefined
    rec.start()
    return () => {
      try { rec.stop() } catch { /* ignore */ }
    }
  } catch {
    return () => undefined
  }
}

export interface NexconnStreamListener {
  onStreamDelta?: (streamId: string, delta: string) => void
  onStreamComplete?: (streamId: string) => void
  onSpeechToText?: (messageId: string, text: string) => void
  onMessageBlocked?: (reason: string) => void
}

/**
 * Registers a lightweight handler on the @nexconn/chat singleton if initialized.
 * Safe no-op in tests or when Nexconn is unconfigured/blocked.
 */
export function attachNexconnFeatureListener(listener: NexconnStreamListener): () => void {
  let active = true
  const handlerId = `mc-features-${Math.random().toString(36).slice(2, 9)}`

  void import('@nexconn/chat')
    .then(({ MessageHandler, NCEngine }) => {
      if (!active || !NCEngine?.addMessageHandler || !MessageHandler) return
      try {
        const handler = new MessageHandler({
          onStreamMessageRequestDelta: (ev) => {
            const delta = ev?.chunkInfo?.content ?? ''
            if (ev?.messageId && delta) listener.onStreamDelta?.(ev.messageId, delta)
          },
          onStreamMessageRequestComplete: (ev) => {
            if (ev?.messageId) listener.onStreamComplete?.(ev.messageId)
          },
          onSpeechToTextCompleted: (ev) => {
            const txt = ev?.info?.text ?? ''
            if (ev?.messageId && txt) listener.onSpeechToText?.(ev.messageId, txt)
          },
          onMessageBlocked: (ev) => {
            listener.onMessageBlocked?.(String(ev?.info?.blockType ?? 'CONTENT_SAFETY'))
          },
        })
        NCEngine.addMessageHandler(handlerId, handler)
      } catch {
        // SDK not initialized yet or unavailable
      }
    })
    .catch(() => undefined)

  return () => {
    active = false
    void import('@nexconn/chat')
      .then(({ NCEngine }) => {
        try { NCEngine?.removeMessageHandler?.(handlerId) } catch { /* ignore */ }
      })
      .catch(() => undefined)
  }
}
