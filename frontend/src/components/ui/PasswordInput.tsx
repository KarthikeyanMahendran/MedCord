import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from './Input'
import type { InputProps } from './Input'

/** Password field with a show/hide toggle (keeps focus and autocomplete behaviour). */
export function PasswordInput(props: InputProps) {
  const [shown, setShown] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <Input {...props} type={shown ? 'text' : 'password'} style={{ paddingRight: 38, ...props.style }} />
      <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Hide password' : 'Show password'} title={shown ? 'Hide password' : 'Show password'}
        style={{ position: 'absolute', right: 4, top: 4, width: 28, height: 28, display: 'grid', placeItems: 'center', border: 0, borderRadius: 4, background: 'transparent', color: 'var(--mc-text-muted)', cursor: 'pointer' }}>
        {shown ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}
