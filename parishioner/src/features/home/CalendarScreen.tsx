import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { Skeleton } from '../../components/ui/skeleton'
import { UpcomingList } from './UpcomingList'
import { ScheduleRow } from './ScheduleRow'
import { fetchBookings } from '../../lib/data/bookings'
import { useAuthStore } from '../../stores/auth-store'
import { useParishInfo } from '../../lib/useParishInfo'
import { cn } from '../../lib/utils'
import { buildCalendarItems } from './calendarItems'
import { parseDateParam } from './dateParam'
import { MonthGrid } from './MonthGrid'
import { useUpcomingEvents } from './useUpcomingEvents'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' })

export function CalendarScreen() {
  const { data: parish } = useParishInfo()
  const userId = useAuthStore((s) => s.user?.id)
  const [params] = useSearchParams()
  const { data: events, isLoading, isError, refetch } = useUpcomingEvents()

  // A parishioner's own appointment belongs on their own calendar, not only parish announcements.
  const { data: bookings } = useQuery({
    queryKey: ['bookings', userId],
    queryFn: () => fetchBookings(userId!),
    enabled: !!userId,
  })

  // `?date=YYYY-MM-DD` (the Home strip links here) preselects that day; a bad value is today.
  const [selectedDate, setSelectedDate] = useState<Date>(() => parseDateParam(params.get('date')))
  // List first: the month grid is one tap away, and a ?date= deep link opens it on that day.
  const [view, setView] = useState<'list' | 'month'>(() => (params.has('date') || params.get('view') === 'month' ? 'month' : 'list'))
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))

  const allItems = useMemo(() => buildCalendarItems(events, bookings), [events, bookings])
  const markedDates = useMemo(() => allItems.map((i) => i.date), [allItems])

  const isToday = selectedDate.toDateString() === new Date().toDateString()
  const scheduleItems = allItems
    .filter((i) => i.date.toDateString() === selectedDate.toDateString())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  const scheduleTitle = isToday
    ? 'Schedule for Today'
    : `Schedule for ${selectedDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`

  function goToMonth(offset: number) {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1))
  }

  const navButton = cn('flex size-11 items-center justify-center rounded-full bg-paper text-ink', FOCUS)

  return (
    <AppShell header={<AppHeader title="Calendar" subtitle={parish?.name} />}>
      <div className="flex flex-col gap-4 p-4">
        <div role="group" aria-label="Calendar view" className="grid grid-cols-2 overflow-hidden rounded-xl border-2 border-navy">
          {(['list', 'month'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                'min-h-12 text-body font-semibold',
                view === v ? 'bg-navy text-white' : 'bg-surface text-navy',
                FOCUS,
              )}
            >
              {v === 'list' ? 'List' : 'Month'}
            </button>
          ))}
        </div>
        <Link to="/events" className={cn('inline-flex min-h-11 items-center self-start text-body font-semibold text-navy underline underline-offset-4', FOCUS)}>
          Parish events
        </Link>

        {view === 'list' ? (
          <UpcomingList items={allItems} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} />
        ) : (
        <>
        <div className="rounded-2xl border border-line bg-surface p-2 sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => goToMonth(-1)} aria-label="Previous month" className={navButton}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <p className="font-display text-base font-semibold text-ink">{MONTH_FORMATTER.format(visibleMonth)}</p>
            <button type="button" onClick={() => goToMonth(1)} aria-label="Next month" className={navButton}>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>

          <MonthGrid month={visibleMonth} markedDates={markedDates} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </div>

        <div aria-busy={isLoading}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">{scheduleTitle}</h2>
            {!isToday && (
              <span className="rounded-full bg-paper px-3 py-1 text-label font-medium text-navy">
                {selectedDate.toLocaleDateString('en-PH', { weekday: 'long' })}
              </span>
            )}
          </div>

          {isLoading && (
            <>
              <p className="sr-only">Loading the schedule</p>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-[4.25rem] w-full rounded-2xl" />
                <Skeleton className="h-[4.25rem] w-full rounded-2xl" />
              </div>
            </>
          )}
          {isError && (
            <p className="text-sm text-danger">
              Couldn&apos;t load events.{' '}
              <button type="button" onClick={() => void refetch()} className={cn('min-h-11 font-semibold underline', FOCUS)}>
                Retry
              </button>
            </p>
          )}

          {scheduleItems.length > 0 && (
            <ul aria-label={scheduleTitle} className="flex flex-col gap-3">
              {scheduleItems.map((item) => (
                <li key={`${item.isOwnBooking ? 'b' : 'e'}-${item.id}`}>
                  <ScheduleRow item={item} withDay={false} />
                </li>
              ))}
            </ul>
          )}
          {!isLoading && !isError && scheduleItems.length === 0 && (
            <div className="flex flex-col items-start gap-1">
              <p className="text-sm text-ink-muted">Nothing scheduled on this day.</p>
              <Link to="/services" className={cn('inline-flex min-h-11 items-center text-sm font-semibold text-navy underline underline-offset-4', FOCUS)}>
                Book a sacrament
              </Link>
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </AppShell>
  )
}
