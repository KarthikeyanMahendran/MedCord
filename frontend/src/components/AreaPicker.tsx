import { useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'

export interface AreaOption { id: string; name: string; district: string; state: string }

interface Props {
  id: string
  options: AreaOption[]
  value: string
  onChange: (id: string) => void
  invalid?: boolean
}

const label = (o: AreaOption) => (o.name.toLowerCase() === o.district.toLowerCase() ? `${o.district}, ${o.state}` : `${o.name} · ${o.district}, ${o.state}`)

/** Type to search every district in India by district, area or state name. */
export function AreaPicker({ id, options, value, onChange, invalid }: Props) {
  const selected = options.find((o) => o.id === value) ?? null
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (!q) return options.slice(0, 40)
    const words = q.split(/\s+/)
    return options.filter((o) => { const hay = `${o.name} ${o.district} ${o.state}`.toLowerCase(); return words.every((w) => hay.includes(w)) }).slice(0, 40)
  }, [options, text])

  const pick = (o: AreaOption) => { onChange(o.id); setText(''); setOpen(false) }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); pick(matches[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="mc-area">
      <input id={id} className="mc-input" role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" autoComplete="off"
        aria-invalid={invalid || undefined} placeholder="Search your district or state"
        value={open || !selected ? text : label(selected)}
        onFocus={() => { setOpen(true); setText('') }} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); if (value) onChange('') }} onKeyDown={onKey} />
      {open && (
        <ul id={`${id}-list`} className="mc-area-list" role="listbox">
          {matches.length === 0 && <li className="mc-area-empty">No district matches “{text}”.</li>}
          {matches.map((o, i) => (
            <li key={o.id} role="option" aria-selected={o.id === value} className={i === active ? 'is-active' : ''} onMouseDown={(e) => { e.preventDefault(); pick(o) }} onMouseEnter={() => setActive(i)}>
              {label(o)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
