import { EmptyState } from '../../components/shared/EmptyState'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarX, Calendar, Clock, MapPin } from 'lucide-react'
import { DateBlock } from '../../components/shared/DateBlock'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Skeleton } from '../../components/ui/skeleton'
import { eventCategoryLabel } from '../../lib/domain'
import type { ParishEventCategory } from '../../lib/types'
import { useUpcomingEvents } from './useUpcomingEvents'

const FILTERS: { id: ParishEventCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mass', label: 'Mass' },
  { id: 'feast', label: 'Feast day' },
  { id: 'seminar', label: 'Seminar' },
  { id: 'fundraiser', label: 'Fundraiser' },
  { id: 'community', label: 'Community' },
  { id: 'notice', label: 'Notice' },
  { id: 'general', label: 'Parish events' },
  { id: 'other', label: 'Other' },
]

const DATE = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const TIME = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })

/**
 * The parish's upcoming events and Mass times: plain dated rows. An event has no page of its own,
 * so a row is not a link and has no chevron or placeholder picture; its category is a word, not a status pill.
 */
export function EventsListScreen() {
  const navigate = useNavigate()
  const { data: events, isLoading, isError, refetch } = useUpcomingEvents()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ParishEventCategory | 'all'>('all')

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return (events ?? []).filter((event) => {
      const matchesFilter = filter === 'all' || event.category === filter
      const matchesQuery = !normalizedQuery || event.title.toLowerCase().includes(normalizedQuery)
      return matchesFilter && matchesQuery
    })
  }, [events, query, filter])

  return (
    <AppShell header={<AppHeader title="Parish events" subtitle={`${events?.length ?? 0} coming up`} onBack={() => navigate(-1)} />}>
      <div className="flex flex-col gap-4 px-4 py-4">
        <div>
          <label htmlFor="events-search" className="mb-1 block text-body font-semibold text-ink">Search events</label>
          <Input id="events-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </div>

        <div role="group" aria-label="Filter by kind" className="flex flex-wrap gap-2">
          {FILTERS.map(({ id, label }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={filter === id ? 'default' : 'outline'}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        {isLoading && (
          <div aria-busy="true" className="flex flex-col gap-3">
            <p role="status" className="sr-only">Loading events…</p>
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        )}
        {isError && (
          <p role="alert" className="text-body text-danger">
            We couldn&apos;t load the parish events.{' '}
            <button type="button" onClick={() => void refetch()} className="min-h-11 font-semibold text-navy underline underline-offset-4">
              Try again
            </button>
          </p>
        )}

        {filteredEvents.length > 0 && (
          <ul aria-label="Events" className="divide-y divide-line border-y border-line">
            {filteredEvents.map((event) => (
              <li key={event.id} className="flex min-h-16 items-center gap-4 px-1 py-3">
                <DateBlock date={event.date} decorative className="w-14 shrink-0" />
                <span aria-hidden="true" className="self-stretch border-l border-line" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-body font-semibold text-ink">{event.title}</h2>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-note text-ink-muted tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar size={16} aria-hidden="true" />
                      <time dateTime={event.date}>{DATE.format(new Date(event.date))}</time>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock size={16} aria-hidden="true" /> {TIME.format(new Date(event.date))}
                    </span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-note text-ink-muted">
                    <MapPin size={16} aria-hidden="true" /> {event.location}
                    <span aria-hidden="true">·</span>
                    <span>{eventCategoryLabel(event.category)}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!isLoading && !isError && filteredEvents.length === 0 && (
          <EmptyState icon={CalendarX} title="No events scheduled." hint="New Masses and parish events appear here as the parish adds them." />
        )}
      </div>
    </AppShell>
  )
}
