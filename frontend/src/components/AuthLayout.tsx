import type { ReactNode } from 'react'
import { BadgeCheck, MessagesSquare, ShieldCheck } from 'lucide-react'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mc-auth">
      <aside className="mc-auth-brand">
        <div className="mc-logo">
          <span className="mc-logo-mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" /></svg>
          </span>
          MedCord
        </div>
        <div className="mc-auth-copy">
          <h1>The professional network <em>clinicians</em> actually talk on.</h1>
          <p>Verified specialty communities, case discussion and secure direct messaging — built for the way medical teams work.</p>
          <ul className="mc-features">
            <li><span><BadgeCheck size={16} /></span><div><strong>Verified professionals</strong><small>Every licence is reviewed before the verified mark appears.</small></div></li>
            <li><span><MessagesSquare size={16} /></span><div><strong>Structured discussion</strong><small>Channels, threads and replies keep case conversations readable.</small></div></li>
            <li><span><ShieldCheck size={16} /></span><div><strong>Accountable by design</strong><small>Edit history, moderation and an audit trail on every community.</small></div></li>
          </ul>
        </div>
        <div className="mc-auth-foot"><span>© {new Date().getFullYear()} MedCord</span><span>No patient-identifiable information</span></div>
      </aside>
      <main className="mc-auth-form"><div className="mc-auth-panel">{children}</div></main>
    </div>
  )
}
