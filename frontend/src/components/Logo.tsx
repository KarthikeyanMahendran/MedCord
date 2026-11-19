import { useId } from 'react'

/** The MedCord mark: a chat bubble (conversation) holding a medical cross (care), with a saffron dot (the village connection). */
export function LogoMark({ size = 32, title }: { size?: number; title?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <defs>
        <linearGradient id={`mc-g-${id}`} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5B86FF" /><stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <path d="M20 4H44A16 16 0 0 1 60 20V36A16 16 0 0 1 44 52H26L12 60V47.5A16 16 0 0 1 4 36V20A16 16 0 0 1 20 4Z" fill={`url(#mc-g-${id})`} />
      <rect x="27" y="13" width="10" height="30" rx="5" fill="#fff" />
      <rect x="17" y="23" width="30" height="10" rx="5" fill="#fff" />
      <circle cx="52" cy="12" r="6.5" fill="#F59E0B" stroke="#fff" strokeWidth="2.5" />
    </svg>
  )
}
