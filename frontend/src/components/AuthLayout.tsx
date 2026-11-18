import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mc-auth">
      <aside className="mc-auth-brand">
        <div className="mc-logo"><span className="mc-logo-mark"><Plus size={20} strokeWidth={3} /></span>MedCord</div>
        <div>
          <h1>Where clinicians connect.</h1>
          <p>Verified communities, case discussions and secure messaging, built for the medical profession.</p>
        </div>
        <ul className="mc-features">
          <li>✓ Verified professional profiles</li>
          <li>✓ Specialty communities and threads</li>
          <li>✓ Edit history and moderation built in</li>
        </ul>
      </aside>
      <main className="mc-auth-form"><div className="mc-auth-panel">{children}</div></main>
    </div>
  )
}
