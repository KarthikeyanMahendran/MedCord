import { useRef } from 'react'
import { Mic, Square } from 'lucide-react'
import { Input, Textarea } from './ui'
import type { InputProps } from './ui/Input'
import type { TextareaProps } from './ui/Textarea'
import { useDictation } from '../lib/useDictation'

const savedLang = () => { try { return localStorage.getItem('mc_lang') ?? 'en-IN' } catch { return 'en-IN' } }

/** Microphone button that types what you say into a field. Hidden if this browser cannot record. */
export function MicButton({ value, onText, label = 'Speak instead of typing', inline }: { value: string; onText: (text: string) => void; label?: string; inline?: boolean }) {
  const latest = useRef(value)
  latest.current = value
  const { available, listening, working, error, toggle } = useDictation(savedLang(), () => latest.current, onText)
  if (!available) return null
  return (
    <>
      <button type="button" className={`vf-mic ${inline ? 'is-inline' : ''} ${listening ? 'is-on' : ''}`} onClick={() => void toggle()} aria-pressed={listening} disabled={working}
        aria-label={listening ? 'Stop listening' : working ? 'Turning your voice into text' : label} title={listening ? 'Tap to stop' : working ? 'Working…' : label}>
        {listening ? <Square size={14} /> : working ? <span aria-hidden="true">…</span> : <Mic size={16} />}
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
