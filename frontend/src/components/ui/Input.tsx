import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className = '', id, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      id={id}
      className={`mc-input ${className}`.trim()}
      aria-invalid={invalid || undefined}
      aria-describedby={id ? `${id}-msg` : undefined}
      {...rest}
    />
  )
})
