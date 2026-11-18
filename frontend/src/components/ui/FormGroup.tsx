import type { ReactNode } from 'react'

interface Props {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}

/** Label + control + hint/error wiring. Children receive aria props via the id convention (`${id}-msg`). */
export function FormGroup({ id, label, hint, error, children }: Props) {
  return (
    <div className="mc-field">
      <label className="mc-label" htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span id={`${id}-msg`} className="mc-error-text" role="alert">{error}</span>
      ) : hint ? (
        <span id={`${id}-msg`} className="mc-hint">{hint}</span>
      ) : null}
    </div>
  )
}
