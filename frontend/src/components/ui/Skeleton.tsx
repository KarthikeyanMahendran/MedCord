import type { CSSProperties } from 'react'

/** A single shimmering placeholder bar. Compose these to mirror the real content's shape. */
export function Skeleton({
  width,
  height,
  radius,
  circle,
  className,
  style,
}: {
  width?: number | string
  height?: number | string
  radius?: number | string
  circle?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      className={`mc-skeleton${className ? ' ' + className : ''}`}
      aria-hidden="true"
      style={{ width, height, borderRadius: circle ? '50%' : radius, ...style }}
    />
  )
}

/** A stack of text lines; the last line is shorter, like a real paragraph. */
export function SkeletonText({ lines = 3, width }: { lines?: number; width?: (number | string)[] }) {
  return (
    <span className="mc-skel-text" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={10} width={width?.[i] ?? (i === lines - 1 ? '55%' : '100%')} />
      ))}
    </span>
  )
}

/** A card-shaped placeholder: an icon tile, a title line, and two body lines. */
export function SkeletonCard() {
  return (
    <div className="mc-skel-card" aria-hidden="true">
      <div className="mc-skel-card-head">
        <Skeleton width={40} height={40} circle />
        <Skeleton width="55%" height={13} />
      </div>
      <SkeletonText lines={2} />
    </div>
  )
}
