/**
 * Muted, evenly-weighted tones: distinguishable at a glance, never louder than content.
 * All keep white initials at WCAG AA contrast.
 */
const TONES = ['#4c5a9e', '#3c7480', '#6d5794', '#467354', '#8a5f43', '#536894', '#80506a', '#4a6a80', '#6b6f3f', '#7a4f4f']

export function hashOf(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Stable colour per name (people and communities). */
export function colorFor(seed: string) {
  return TONES[hashOf(seed) % TONES.length]
}

export function initialsOf(name: string) {
  return name.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').split(/[\s,]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?'
}

interface Props { name: string; size?: 'sm' | 'md' | 'lg'; square?: boolean; className?: string }

/** Initials avatar. Decorative: the name is always rendered as text alongside it. */
export function Avatar({ name, size, square, className = '' }: Props) {
  return (
    <span className={['mc-avatar', size, square && 'is-square', className].filter(Boolean).join(' ')} style={{ background: colorFor(name) }} aria-hidden="true">
      {initialsOf(name)}
    </span>
  )
}
