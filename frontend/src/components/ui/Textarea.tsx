import { forwardRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { invalid?: boolean }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ invalid, className = '', id, ...rest }, ref) {
  return (
    <textarea ref={ref} id={id} rows={4} className={`mc-input mc-textarea ${className}`.trim()}
      aria-invalid={invalid || undefined} aria-describedby={id ? `${id}-msg` : undefined} {...rest} />
  )
})
