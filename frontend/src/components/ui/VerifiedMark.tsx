import { BadgeCheck } from 'lucide-react'

/** Small verified-licence check, shown next to a name. Replaces repeated "verified" pills. */
export function VerifiedMark({ size = 14 }: { size?: number }) {
  return (
    <span className="mc-verified-mark" role="img" aria-label="Verified" title="Verified medical professional">
      <BadgeCheck size={size} strokeWidth={2.25} aria-hidden="true" />
    </span>
  )
}
