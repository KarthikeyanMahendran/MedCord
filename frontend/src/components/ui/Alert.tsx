import type { ReactNode } from 'react'

export function Alert({ tone = 'info', children }: { tone?: 'danger' | 'success' | 'info'; children: ReactNode }) {
  return <div className={`mc-alert mc-alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>
}
