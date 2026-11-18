import type { ReactNode } from 'react'
import { BrandFilm } from './BrandFilm'

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
          <h1>A doctor in every <em>village</em>, one tap away.</h1>
          <p>Health workers and verified doctors meet in a live room for every case, with instant triage and answers that help the next patient.</p>
          <BrandFilm />
        </div>
        <div className="mc-auth-foot"><span>© {new Date().getFullYear()} MedCord</span><span>No patient-identifiable information</span></div>
      </aside>
      <main className="mc-auth-form"><div className="mc-auth-panel">{children}</div></main>
    </div>
  )
}
