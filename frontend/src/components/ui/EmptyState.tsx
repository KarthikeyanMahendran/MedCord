import type { ReactNode } from 'react'

interface Props { title: string; icon?: ReactNode; action?: ReactNode; children?: ReactNode }

/** Empty and zero states: an icon tile, one line of title, one of guidance, and at most one action. */
export function EmptyState({ title, icon, action, children }: Props) {
  return (
    <div className="mc-empty" role="status">
      {icon && <span className="mc-empty-icon" aria-hidden="true">{icon}</span>}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  )
}
