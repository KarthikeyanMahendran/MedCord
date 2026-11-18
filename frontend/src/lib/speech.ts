/** Thin wrappers over the browser's built-in speech APIs (no keys, no server). */

export const LANGUAGES = [
  { code: 'en-IN', short: 'en', label: 'English' },
  { code: 'ta-IN', short: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'hi-IN', short: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'ml-IN', short: 'ml', label: 'മലയാളം (Malayalam)' },
  { code: 'te-IN', short: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'kn-IN', short: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'bn-IN', short: 'bn', label: 'বাংলা (Bengali)' },
] as const

interface RecognitionResult { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }
interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean
  onresult: ((e: RecognitionResult) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void; stop(): void
}
type RecognitionCtor = new () => Recognition

function ctor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const canDictate = () => ctor() !== null
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window

/** Starts dictation; calls onText with the full transcript so far. Returns a stop function. */
export function dictate(lang: string, onText: (text: string) => void, onDone: (error?: string) => void): () => void {
  const Ctor = ctor()
  if (!Ctor) { onDone('Voice input is not supported in this browser. Try Chrome or Edge.'); return () => undefined }
  const rec = new Ctor()
  rec.lang = lang
  rec.interimResults = true
  rec.continuous = true
  rec.onresult = (e) => {
    let text = ''
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
    onText(text)
  }
  rec.onerror = (e) => onDone(e.error === 'not-allowed' ? 'Microphone permission was denied.' : e.error === 'no-speech' ? undefined : `Voice input error: ${e.error}`)
  rec.onend = () => onDone()
  rec.start()
  return () => rec.stop()
}

export function speak(text: string, lang: string) {
  if (!canSpeak()) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang
  u.rate = 0.9
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() { if (canSpeak()) window.speechSynthesis.cancel() }
