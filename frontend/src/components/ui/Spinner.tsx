/** Brand spinner and a centred full-area loader for route/page-level waits. */
export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      className={`mc-spinner${className ? ' ' + className : ''}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  )
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="mc-pageloader" role="status" aria-live="polite">
      <Spinner size={28} />
      <span className="mc-pageloader-label">{label}</span>
    </div>
  )
}
