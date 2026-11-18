import type { ReactNode } from 'react'

/** Consistent page title block: optional eyebrow (breadcrumb), title, description, and right-aligned actions. */
export function PageHeader({ title, description, eyebrow, actions, leading }: {
  title: ReactNode; description?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; leading?: ReactNode
}) {
  return (
    <header className="mc-page-header">
      <div className="mc-row" style={{ alignItems: 'center', gap: 14, minWidth: 0 }}>
        {leading}
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div className="mc-eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
      </div>
      {actions && <div className="mc-row" style={{ gap: 8, flex: 'none' }}>{actions}</div>}
    </header>
  )
}
