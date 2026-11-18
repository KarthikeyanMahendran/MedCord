import type { ReactNode } from 'react'

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mc-empty" role="status">
      <strong>{title}</strong>
      {children && <p className="mc-hint">{children}</p>}
    </div>
  )
}
