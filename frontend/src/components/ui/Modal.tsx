import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from './Button'

interface Props {
  isOpen: boolean
  onClose: () => void
  title?: string
  size?: 'sm' | 'md' | 'lg'
  footer?: ReactNode
  children: ReactNode
}

/** Portal dialog: Esc and backdrop close, body scroll lock, role=dialog. */
export function Modal({ isOpen, onClose, title, size = 'md', footer, children }: Props) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null
  return createPortal(
    <div className="mc-modal-backdrop" onMouseDown={onClose}>
      <div className={`mc-modal ${size}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        {title && (
          <div className="mc-modal-header">
            <span>{title}</span>
            <Button variant="icon" aria-label="Close" onClick={onClose}><X size={18} /></Button>
          </div>
        )}
        <div className="mc-modal-body">{children}</div>
        {footer && <div className="mc-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
