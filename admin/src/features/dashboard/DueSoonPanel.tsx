import { CalendarClock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatTime } from '../../lib/domain'
import type { DueSoonItem } from '../../lib/types'
import { cn } from '../../lib/utils'
import { dueWhen } from './dashboardModel'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/** The visits that fall due today or in the next two days, soonest first: the office's reminder list. */
export function DueSoonPanel({ items, today, compact }: { items: DueSoonItem[]; today: string; compact: boolean }) {
  return (
    <section aria-label="Due soon" className={cn('flex-1 rounded-2xl border border-line bg-surface', compact ? 'px-4 pb-1.5 pt-4' : 'px-[22px] pb-2 pt-[18px]')}>
      <h2 className={cn('font-display font-semibold text-navy', compact ? 'mb-1 text-[20px]' : 'mb-1.5 text-[22px]')}>Due soon</h2>
      <p className="mb-2 text-[13px] text-ink-muted">Visits today and in the next 2 days.</p>
      {items.length === 0 ? (
        <p className="border-t border-line py-4 text-[14px] text-ink-muted">Nothing falls due in the next 2 days.</p>
      ) : (
        <ul>
          {items.map((d, i) => (
            <li key={d.bookingId} className={cn(i > 0 && 'border-t border-line')}>
              <Link to={`/bookings/${d.bookingId}`} className={cn('flex items-center gap-3 rounded-md text-ink no-underline', compact ? 'min-h-14' : 'min-h-[52px]', FOCUS)}>
                <CalendarClock size={20} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-navy" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">{d.subjectName}</span>
                  <span className="block text-[13px] text-ink-muted">{d.service}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-right text-[13px] text-ink-muted">
                  <span className="block font-medium text-ink">{dueWhen(d.date, today)}</span>
                  {d.start && <span className="block">{formatTime(d.start)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
