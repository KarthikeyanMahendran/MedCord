import { useCallback, useEffect, useRef, useState } from 'react'
import { canDictate, dictate } from './speech'
import { canRecord, startRecording, transcribe } from './sarvam'
import type { Recording } from './sarvam'
import { problemMessage } from '../api/client'

/**
 * Voice typing. English in Chrome or Edge types live with the browser. Every other Indian language, and every other browser,
 * records the voice and sends it to Sarvam AI, which is far more accurate for Indian languages.
 */
export function useDictation(lang: string, current: () => string, setText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stopLive = useRef<(() => void) | null>(null)
  const rec = useRef<Recording | null>(null)
  const cutoff = useRef<ReturnType<typeof setTimeout> | null>(null)

  const viaSarvam = lang !== 'en-IN' || !canDictate()
  const available = viaSarvam ? canRecord() : canDictate()
  const join = (base: string, spoken: string) => (base ? base.replace(/\s+$/, '') + ' ' : '') + spoken

  const finish = useCallback(async () => {
    const r = rec.current
    if (!r) return
    rec.current = null
    if (cutoff.current) clearTimeout(cutoff.current)
    setListening(false); setWorking(true)
    try {
      const spoken = (await transcribe(await r.stop(), lang)).trim()
      if (spoken) setText(join(current(), spoken))
      else setError('I could not hear anything. Try again, a little closer to the microphone.')
    } catch (e) { setError(problemMessage(e)) } finally { setWorking(false) }
  }, [lang, current, setText])

  useEffect(() => () => { stopLive.current?.(); if (cutoff.current) clearTimeout(cutoff.current); void rec.current?.stop() }, [])

  const toggle = useCallback(async () => {
    setError(null)
    if (viaSarvam) {
      if (working) return
      if (listening) { await finish(); return }
      try {
        rec.current = await startRecording()
        setListening(true)
        cutoff.current = setTimeout(() => { void finish() }, 60_000)
      } catch { setError('Microphone permission was denied.') }
      return
    }
    if (listening) { stopLive.current?.(); return }
    const base = current()
    setListening(true)
    stopLive.current = dictate(lang, (t) => setText(join(base, t)), (err) => { setListening(false); if (err) setError(err) })
  }, [viaSarvam, working, listening, finish, current, lang, setText])

  return { available, listening, working, error, toggle }
}
