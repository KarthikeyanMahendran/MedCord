/** Illustrated portraits (original SVG art, no external images). */
type Look = {
  skin: string; hair: string; bg: string; hairStyle?: 'short' | 'long' | 'bun' | 'cap'
  top: string; role: 'doctor' | 'asha' | 'admin'; glasses?: boolean
}

export const PEOPLE: Record<string, Look> = {
  doctorF: { skin: '#c68a63', hair: '#1c1412', bg: '#dbe8ff', hairStyle: 'bun', top: '#ffffff', role: 'doctor' },
  doctorM: { skin: '#a8714b', hair: '#15110f', bg: '#d4f0ff', hairStyle: 'short', top: '#ffffff', role: 'doctor', glasses: true },
  asha: { skin: '#b9794f', hair: '#1a1210', bg: '#e3e0ff', hairStyle: 'long', top: '#e4572e', role: 'asha' },
  asha2: { skin: '#d49a73', hair: '#241915', bg: '#ffe9d6', hairStyle: 'long', top: '#2a9d8f', role: 'asha' },
  admin: { skin: '#e0ac86', hair: '#3a2a22', bg: '#dff7ee', hairStyle: 'short', top: '#2c3e75', role: 'admin', glasses: true },
}

export function Person({ look, size = 120, className }: { look: keyof typeof PEOPLE; size?: number; className?: string }) {
  const p = PEOPLE[look]
  const id = `g-${look}`
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${p.role} illustration`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p.bg} /><stop offset="1" stopColor="#ffffff" stopOpacity=".6" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="28" fill={`url(#${id})`} />
      {/* back hair */}
      {p.hairStyle === 'long' && <path d="M30 62c-4-30 12-42 30-42s34 12 30 42l2 40H28z" fill={p.hair} />}
      {/* shoulders / clothing */}
      <path d="M14 120c2-26 20-36 46-36s44 10 46 36z" fill={p.top} />
      {p.role === 'doctor' && (<>
        <path d="M44 86l16 20 16-20" fill="none" stroke="#c9d6ee" strokeWidth="3" />
        <path d="M42 88c-6 10-4 20 2 22M78 88c6 10 4 20-2 22" fill="none" stroke="#2b3a67" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="44" cy="111" r="3.2" fill="#4f6bff" />
        <rect x="76" y="96" width="9" height="9" rx="2" fill="#e8eeff" /><path d="M80.5 98v5M78 100.5h5" stroke="#4f6bff" strokeWidth="1.6" />
      </>)}
      {p.role === 'asha' && <path d="M60 84c10 6 26 14 40 36H80C74 104 66 94 60 84z" fill="#f3b33d" opacity=".95" />}
      {p.role === 'admin' && <path d="M60 86l-8 14 8 20 8-20z" fill="#4f6bff" />}
      {/* neck + head */}
      <rect x="52" y="70" width="16" height="18" rx="7" fill={p.skin} />
      <ellipse cx="60" cy="52" rx="21" ry="24" fill={p.skin} />
      {/* hair front */}
      {p.hairStyle === 'short' && <path d="M38 50c-2-20 12-28 23-28s24 8 21 28c-4-10-10-14-22-14S42 40 38 50z" fill={p.hair} />}
      {p.hairStyle === 'bun' && (<><circle cx="60" cy="22" r="9" fill={p.hair} /><path d="M38 52c-2-22 12-30 22-30s24 8 22 30c-4-12-12-17-22-17S42 40 38 52z" fill={p.hair} /></>)}
      {p.hairStyle === 'long' && <path d="M38 52c-2-22 12-30 22-30s24 8 22 30c-4-12-12-17-22-17S42 40 38 52z" fill={p.hair} />}
      {/* face */}
      <circle cx="51" cy="54" r="2.2" fill="#2a1d18" /><circle cx="69" cy="54" r="2.2" fill="#2a1d18" />
      <path d="M52 65c4 4 12 4 16 0" fill="none" stroke="#7a3f2a" strokeWidth="2.4" strokeLinecap="round" />
      {p.role === 'asha' && <circle cx="60" cy="44" r="2" fill="#c2185b" />}
      {p.glasses && (<g fill="none" stroke="#2b3a67" strokeWidth="2">
        <rect x="42" y="48" width="14" height="11" rx="4" /><rect x="64" y="48" width="14" height="11" rx="4" /><path d="M56 53h8" />
      </g>)}
    </svg>
  )
}
