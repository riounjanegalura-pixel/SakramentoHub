import { ChevronLeft, ChevronRight } from 'lucide-react'

const BTN =
  'inline-flex h-11 items-center gap-1 rounded-xl border border-input-border bg-surface px-4 text-[14px] font-semibold text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:border-line disabled:text-ink-muted disabled:opacity-70'

/** "Showing 11 to 20 of 214" with Previous and Next. Renders nothing until there is more than one page. */
export function ListPager({
  page,
  pageCount,
  total,
  size = 10,
  onPage,
  className = '',
}: {
  page: number
  pageCount: number
  total: number
  size?: number
  onPage: (page: number) => void
  className?: string
}) {
  if (pageCount <= 1) return null
  const from = (page - 1) * size + 1
  const to = Math.min(page * size, total)
  return (
    <nav aria-label="Pages" className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <p role="status" className="text-[14px] text-ink-muted">
        Showing {from} to {to} of {total.toLocaleString('en-PH')}
      </p>
      <div className="flex gap-2">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className={BTN}>
          <ChevronLeft size={16} aria-hidden="true" /> Previous
        </button>
        <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPage(page + 1)} className={BTN}>
          Next <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
