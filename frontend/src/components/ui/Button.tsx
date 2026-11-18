import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'md' | 'sm'
  full?: boolean
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', full, loading, className = '', type = 'button', children, disabled, ...rest },
  ref,
) {
  const cls = ['mc-btn', `mc-btn-${variant}`, size === 'sm' && 'is-sm', full && 'is-full', className].filter(Boolean).join(' ')
  return (
    <button ref={ref} type={type} className={cls} aria-busy={loading || undefined} disabled={loading || disabled} {...rest}>
      {loading && <span className="mc-spinner" aria-hidden="true" />}
      {children}
    </button>
  )
})
