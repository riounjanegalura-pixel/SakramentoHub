import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PaginatedMeta } from '../../lib/types'

export function Pagination({
  meta,
  onPageChange,
}: {
  meta: PaginatedMeta
  onPageChange: (page: number) => void
}) {
  if (meta.last_page <= 1) return null

  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-muted">
      <p>
        Page {meta.current_page} of {meta.last_page} &middot; {meta.total} total
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(meta.current_page - 1)}
          disabled={meta.current_page <= 1}
          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <button
          type="button"
          onClick={() => onPageChange(meta.current_page + 1)}
          disabled={meta.current_page >= meta.last_page}
          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 disabled:opacity-40"
          aria-label="Next page"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
