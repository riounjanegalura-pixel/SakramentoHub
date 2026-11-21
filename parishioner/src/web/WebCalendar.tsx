import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchBookings } from '../lib/data/bookings'
import { useAuthStore } from '../stores/auth-store'
import { buildCalendarItems } from '../features/home/calendarItems'
import { useUpcomingEvents } from '../features/home/useUpcomingEvents'
import { cn } from '../lib/utils'
import { parseDateParam } from '../features/home/dateParam'
import { Skeleton } from '../components/ui/skeleton'
import { WebFrame } from './WebFrame'
import { WebMonthCalendar } from './WebMonthCalendar'

type Filter = 'all' | 'events' | 'mine'
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'events', label: 'Parish events' },
  { id: 'mine', label: 'My bookings' },
]
const TIME = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' })
const DAY_TITLE = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })

export function WebCalendar() {
  const [params] = useSearchParams()
  const userId = useAuthStore((s) => s.user?.id)
  const { data: events, isLoading, isError, refetch } = useUpcomingEvents()
  const { data: bookings } = useQuery({
    queryKey: ['bookings', userId],
    queryFn: () => fetchBookings(userId!),
    enabled: !!userId,
  })
  const [selected, setSelected] = useState<Date>(() => parseDateParam(params.get('date')))
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1))
  const [filter, setFilter] = useState<Filter>('all')

  const items = useMemo(
    () => buildCalendarItems(events, bookings).filter((i) => filter === 'all' || (filter === 'mine') === i.isOwnBooking),
    [events, bookings, filter],
  )
  const dayItems = items
    .filter((i) => i.date.toDateString() === selected.toDateString())
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  return (
    <WebFrame width="max-w-6xl">
      <h1 className="mb-4 font-display text-title font-semibold text-navy">Calendar</h1>
      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn('rounded-full border px-4 py-1.5 text-sm font-medium', filter === f.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-foreground hover:bg-accent')}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <WebMonthCalendar
          month={month}
          items={items}
          selected={selected}
          onSelect={setSelected}
          onMonthChange={(d) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + d, 1))}
        />
        <section aria-busy={isLoading} className="h-fit rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-3 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">{DAY_TITLE.format(selected)}</h2>
          {isLoading && (
            <>
              <p className="sr-only">Loading the schedule</p>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            </>
          )}
          {isError && (
            <p className="text-sm text-danger">
              Couldn&apos;t load events.{' '}
              <button type="button" onClick={() => void refetch()} className="min-h-11 font-semibold underline focus-visible:outline-2 focus-visible:outline-focus">Retry</button>
            </p>
          )}
          {dayItems.length > 0 && (
            <ul className="flex flex-col gap-2">
              {dayItems.map((it) => {
                const body = (
                  <>
                    <span className="tabular-nums block text-label font-semibold text-ink-muted">{TIME.format(it.date)}</span>
                    <span className="block font-medium text-ink">{it.title}</span>
                  </>
                )
                return (
                  <li key={it.id}>
                    {it.isOwnBooking ? (
                      <Link to={'/booking/history/' + it.id} className="block min-h-11 rounded-xl bg-status-pending-bg p-3 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-focus">{body}</Link>
                    ) : (
                      <div className="rounded-xl bg-paper p-3">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {!isLoading && !isError && dayItems.length === 0 && (
            <div className="flex flex-col items-start gap-1">
              <p className="text-sm text-ink-muted">Nothing on this day.</p>
              <Link to="/services" className="inline-flex min-h-11 items-center text-sm font-semibold text-navy underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus">Book a sacrament</Link>
            </div>
          )}
        </section>

      </div>
    </WebFrame>
  )
}
