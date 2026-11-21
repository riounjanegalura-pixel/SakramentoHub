import { Skeleton } from '../../components/ui/skeleton'
import { parishToday } from '../../lib/domain'
import type { CalendarItem } from './calendarItems'
import { ScheduleRow } from './ScheduleRow'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Calendar days between two YYYY-MM-DD dates. */
function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000)
}

type Group = 'This week' | 'Next week' | 'Later'

/**
 * What is coming up, soonest first, in plain dated rows under "This week", "Next week" and "Later".
 * Mass times and parish events are plain; the parishioner's own appointments link to the booking. Real `<time>` elements.
 */
export function UpcomingList({ items, isLoading, isError, onRetry }: { items: CalendarItem[]; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  const today = parishToday()
  const upcoming = items
    .filter((i) => ymd(i.date) >= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  const groups: Array<{ title: Group; items: CalendarItem[] }> = (['This week', 'Next week', 'Later'] as const)
    .map((title) => ({
      title,
      items: upcoming.filter((i) => {
        const d = daysBetween(today, ymd(i.date))
        return title === 'This week' ? d < 7 : title === 'Next week' ? d >= 7 && d < 14 : d >= 14
      }),
    }))
    .filter((g) => g.items.length > 0)

  if (isLoading) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <p role="status" className="sr-only">Loading the schedule</p>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    )
  }
  if (isError) {
    return (
      <p role="alert" className="text-body text-danger">
        We couldn&apos;t load the parish schedule.{' '}
        <button type="button" onClick={onRetry} className="min-h-11 font-semibold text-navy underline underline-offset-4">
          Try again
        </button>
      </p>
    )
  }
  if (groups.length === 0) return <p className="text-body text-ink-muted">Nothing is scheduled yet.</p>

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`up-${g.title.replace(/\s/g, '-')}`}>
          <h2 id={`up-${g.title.replace(/\s/g, '-')}`} className="mb-1 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">{g.title}</h2>
          <ul className="divide-y divide-line border-y border-line">
            {g.items.map((item) => (
              <li key={`${item.isOwnBooking ? 'b' : 'e'}-${item.id}`} className={item.isOwnBooking ? 'py-3' : undefined}>
                <ScheduleRow item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
