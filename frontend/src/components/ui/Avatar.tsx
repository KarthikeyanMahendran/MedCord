const PALETTE = [
  ['#7c6cff', '#b05cff'], ['#2fd6f0', '#4f8cff'], ['#ff6bd6', '#ff8a5c'], ['#3ddc97', '#2fb8d6'],
  ['#ffb454', '#ff6b7d'], ['#8a7dff', '#35d0e8'], ['#ff7ab8', '#a56bff'], ['#4fd1c5', '#7c6cff'],
]

export function hashOf(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function gradientFor(seed: string) {
  const [a, b] = PALETTE[hashOf(seed) % PALETTE.length]
  return `linear-gradient(135deg, ${a}, ${b})`
}

export function initialsOf(name: string) {
  return name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').split(/[\s,]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?'
}

/** Gradient initials avatar; the colour is stable per name. */
export function Avatar({ name, size, className = '' }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={`mc-avatar ${size ?? ''} ${className}`.trim()} style={{ background: gradientFor(name) }} aria-hidden="true">{initialsOf(name)}</span>
  )
}
