import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <nav className="mc-pagination" aria-label="Pagination">
      <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></Button>
      <span className="mc-hint">Page {page + 1} of {totalPages}</span>
      <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight size={14} /></Button>
    </nav>
  )
}
