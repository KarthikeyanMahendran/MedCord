import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { Input, Textarea } from './ui'
import type { InputProps } from './ui/Input'
import type { TextareaProps } from './ui/Textarea'
import { canDictate, dictate } from '../lib/speech'

const savedLang = () => { try { return localStorage.getItem('mc_lang') ?? 'en-IN' } catch { return 'en-IN' } }

/** Microphone button that types what you say into a field. Hidden in browsers that cannot do it. */
export function MicButton({ value, onText, label = 'Speak instead of typing', inline }: { value: string; onText: (text: string) => void; label?: string; inline?: boolean }) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])
  if (!canDictate()) return null

  const toggle = () => {
    if (listening) { stop.current?.(); return }
    const base = value ? value.replace(/\s+$/, '') + ' ' : ''
    setError(null); setListening(true)
    stop.current = dictate(savedLang(), (t) => onText(base + t), (err) => { setListening(false); if (err) setError(err) })
  }

  return (
    <>
      <button type="button" className={`vf-mic ${inline ? 'is-inline' : ''} ${listening ? 'is-on' : ''}`} onClick={toggle} aria-pressed={listening}
        aria-label={listening ? 'Stop listening' : label} title={listening ? 'Tap to stop' : label}>
        {listening ? <Square size={14} /> : <Mic size={16} />}
      </button>
      {error && <span className="vf-err" role="alert">{error}</span>}
    </>
  )
}

/** A text input with a microphone. */
export function VoiceInput({ value, onValue, ...rest }: Omit<InputProps, 'value' | 'onChange'> & { value: string; onValue: (v: string) => void }) {
  return (
    <div className="vf-wrap">
      <Input {...rest} value={value} onChange={(e) => onValue(e.target.value)} style={{ paddingRight: 44 }} />
      <MicButton value={value} onText={onValue} />
    </div>
  )
}

/** A text area with a microphone. */
export function VoiceTextarea({ value, onValue, ...rest }: Omit<TextareaProps, 'value' | 'onChange'> & { value: string; onValue: (v: string) => void }) {
  return (
    <div className="vf-wrap">
      <Textarea {...rest} value={value} onChange={(e) => onValue(e.target.value)} style={{ paddingRight: 44 }} />
      <MicButton value={value} onText={onValue} />
    </div>
  )
}
