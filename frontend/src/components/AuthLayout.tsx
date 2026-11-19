import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { BrandFilm } from './BrandFilm'
import { LogoMark } from './Logo'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mc-auth">
      <aside className="mc-auth-brand">
        <BrandFilm />
        <div className="mc-logo">
          <span className="mc-logo-mark" aria-hidden="true"><LogoMark size={44} /></span>
          MedCord
        </div>
        <div className="mc-auth-copy">
          <h1>A doctor in every <em>village</em>, one tap away.</h1>
          <p>Health workers and verified doctors meet in a live room for every case, with instant triage and answers that help the next patient.</p>
        </div>
        <div className="mc-auth-foot"><span>© {new Date().getFullYear()} MedCord</span><span>No patient-identifiable information</span></div>
      </aside>
      <main className="mc-auth-form">
        <Link to="/welcome" className="mc-auth-home"><ArrowLeft size={15} /> Back to home</Link>
        <div className="mc-auth-panel">{children}</div>
      </main>
    </div>
  )
}
