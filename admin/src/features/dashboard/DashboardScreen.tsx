import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { LoadError } from '../../components/shared/LoadError'
import { Skeleton } from '../../components/shared/Skeleton'
import { fetchAnalytics } from '../../lib/data/analytics'
import { fetchSchedule } from '../../lib/data/schedule'
import { addDays, dayTitle, monthBounds, monthTitle, shiftMonth, weekOf } from '../../lib/dates'
import { parishToday } from '../../lib/domain'
import { useIsPhone } from '../../lib/hooks/useIsPhone'
import { cn } from '../../lib/utils'
import { useAuthStore } from '../../stores/auth-store'
import { parseDateParam } from '../schedule/dateParam'
import { AheadChart, BookingsChart } from './Charts'
import { DatePicker } from './DatePicker'
import { DueSoonPanel } from './DueSoonPanel'
import { DayPanel, WeekStrip } from './DayPanel'
import { DaySheet } from './DaySheet'
import { buildDay, findingText, parishNowMinutes, weekdayMonthDay } from './dashboardModel'
import { MonthGrid } from './MonthGrid'
import { analyticsShape, PanelBoundary, PanelUnavailable } from './PanelBoundary'
import { UrgentBanner } from './UrgentBanner'
import { WaitingPanel } from './WaitingPanel'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
const ARROW = `flex size-10 items-center justify-center rounded-[10px] text-navy hover:bg-paper ${FOCUS}`
const PULSE = ''
/** One column until the content area is wide enough, then 3 : 2. Sized by the content area (a container query), not the screen, so it follows the sidebar and zoom. */
const SPLIT = 'grid grid-cols-1 items-stretch gap-5 @[880px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'

/** Same shape as the loaded page, so nothing jumps when the data arrives. */
function LoadingShape({ compact }: { compact: boolean }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the dashboard" className="flex flex-col gap-5">
      <div className={SPLIT}>
        <Skeleton className={cn('h-[380px] rounded-2xl bg-paper-deep', PULSE, compact && 'h-72')} />
        {!compact && <Skeleton className={cn('h-[380px] rounded-2xl bg-paper-deep', PULSE)} />}
      </div>
      <div className={SPLIT}>
        <Skeleton className={cn('h-[480px] rounded-2xl bg-paper-deep', PULSE, compact && 'h-72')} />
        {!compact && <Skeleton className={cn('h-[480px] rounded-2xl bg-paper-deep', PULSE)} />}
      </div>
    </div>
  )
}

type PhoneTab = 'today' | 'waiting'

function PhoneTabs({ tab, onTab, count }: { tab: PhoneTab; onTab: (t: PhoneTab) => void; count: number }) {
  const refs = useRef<Record<PhoneTab, HTMLButtonElement | null>>({
    today: null,
    waiting: null,
  })
  const tabs: Array<[PhoneTab, string]> = [
    ['today', 'Today'],
    ['waiting', 'Waiting'],
  ]
  function onKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const next: PhoneTab = tab === 'today' ? 'waiting' : 'today'
    onTab(next)
    refs.current[next]?.focus()
  }
  return (
    <div role="tablist" aria-label="Dashboard sections" onKeyDown={onKey} className="flex rounded-xl bg-paper-deep p-1">
      {tabs.map(([id, label]) => {
        const on = tab === id
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el
            }}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={on}
            aria-controls={`panel-${id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onTab(id)}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[9px] text-[15px]',
              FOCUS,
              on ? 'bg-surface font-semibold text-navy shadow-[inset_0_0_0_2px_var(--navy)]' : 'font-medium text-ink-muted',
            )}
          >
            {label}
            {id === 'waiting' && <span className="tabular-nums text-ink-muted">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The Dashboard: the day and the month, what is waiting, the next 14 days, what happened
 * lately and new bookings. The selected day lives in ?date= so a day is linkable; the old Schedule screen's links land here.
 */
export function DashboardScreen() {
  const phone = useIsPhone()
  const [params, setParams] = useSearchParams()
  const today = parishToday()
  const date = parseDateParam(params.get('date'), today)
  const isToday = date === today
  const [tab, setTab] = useState<PhoneTab>('today')
  const [pickerOpen, setPickerOpen] = useState(false)
  const user = useAuthStore((s) => s.user)

  const analytics = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: fetchAnalytics,
  })
  // One request covers the shown month plus the week around it, so the phone's week strip never runs off the data.
  const { start: monthStart, end: monthEnd } = monthBounds(date)
  const rangeStart = addDays(monthStart, -6)
  const rangeEnd = addDays(monthEnd, 6)
  const schedule = useQuery({
    queryKey: ['admin-schedule', rangeStart, rangeEnd],
    queryFn: () => fetchSchedule(rangeStart, rangeEnd),
  })

  const now = new Date()
  const nowMin = parishNowMinutes(now)
  const byDate = useMemo(() => new Map((schedule.data?.days ?? []).map((d) => [d.date, d])), [schedule.data])
  const day = byDate.get(date)
  const model = useMemo(
    () => buildDay(day, schedule.data?.travelBufferMinutes ?? 0, isToday, nowMin),
    [day, schedule.data?.travelBufferMinutes, isToday, nowMin],
  )
  const todayModel = useMemo(
    () => buildDay(byDate.get(today), schedule.data?.travelBufferMinutes ?? 0, true, nowMin),
    [byDate, today, schedule.data?.travelBufferMinutes, nowMin],
  )

  const select = (next: string) => setParams(next === today ? {} : { date: next }, { replace: true })
  const title = isToday ? 'Today' : dayTitle(date).replace(/, \d{4}$/, '')
  const scheduleError = schedule.isError ? `The schedule didn't load: ${(schedule.error as Error).message}` : null
  const printDay = () => window.print()

  const data = analytics.data
  const shape = analyticsShape(data)
  const retryAnalytics = () => void analytics.refetch()
  const a = shape.attention ? data?.attention : undefined
  const waiting = a ? a.awaitingReview + a.certificateRequests + a.refundDue + a.holdsExpiringSoon : 0
  const finding =
    data && a
      ? findingText({
          isToday: true,
          todayVisits: todayModel.visits.length,
          next: todayModel.next,
          nowMin,
          waiting,
          holds: (Array.isArray(data.waitingPreview) ? data.waitingPreview : []).filter((w) => w.kind === 'hold'),
          holdCount: a.holdsExpiringSoon,
          now,
        })
      : ''
  const urgent = schedule.data?.unscheduled ?? []

  const dayPanel = (
    <PanelBoundary title="The day" onRetry={() => void schedule.refetch()}>
      <DayPanel
        title={title}
        day={day}
        model={model}
        compact={phone}
        nowMin={nowMin}
        isToday={isToday}
        loading={schedule.isLoading}
        error={scheduleError}
        onRetry={() => void schedule.refetch()}
        onPrint={printDay}
        weekStrip={
          phone ? <WeekStrip days={weekOf(date)} selected={date} byDate={byDate} onSelect={select} onOpenMonth={() => setPickerOpen(true)} /> : undefined
        }
      />
    </PanelBoundary>
  )

  // Each panel stands alone: a part the server sent in an old shape, or one that throws, shows its own message.
  const waitingPanel = (compact: boolean) =>
    shape.waiting && data ? (
      <PanelBoundary title="Waiting for you" onRetry={retryAnalytics}>
        <WaitingPanel attention={data.attention} preview={data.waitingPreview} compact={compact} now={now} />
      </PanelBoundary>
    ) : (
      <PanelUnavailable title="Waiting for you" onRetry={retryAnalytics} />
    )
  const aheadChart = (compact: boolean) =>
    shape.ahead && data ? (
      <PanelBoundary title="Next 14 days" onRetry={retryAnalytics}>
        <AheadChart days={data.visitsAhead} compact={compact} />
      </PanelBoundary>
    ) : (
      <PanelUnavailable title="Next 14 days" onRetry={retryAnalytics} />
    )
  const bookingsChart = (compact: boolean) =>
    shape.bookings && data ? (
      <PanelBoundary title="New bookings" onRetry={retryAnalytics}>
        <BookingsChart days={data.bookingsPerDay} compact={compact} />
      </PanelBoundary>
    ) : (
      <PanelUnavailable title="New bookings" onRetry={retryAnalytics} />
    )
  const dueSoonPanel = (compact: boolean) =>
    shape.dueSoon && data ? (
      <PanelBoundary title="Due soon" onRetry={retryAnalytics}>
        <DueSoonPanel items={data.dueSoon} today={today} compact={compact} />
      </PanelBoundary>
    ) : (
      <PanelUnavailable title="Due soon" onRetry={retryAnalytics} />
    )

  return (
    <AdminLayout title="Dashboard">
      <div className="@container flex w-full max-w-[1760px] flex-col gap-4 md:gap-5 print:hidden">
        <header className="min-w-0">
          <p className="mb-1 flex items-center gap-2 text-[14px] text-ink-muted">
            <span aria-hidden="true" className="size-2 rounded-full bg-gold" />
            {weekdayMonthDay(today)}
          </p>
          {data && finding && <p className="text-[15px] leading-[1.4] text-ink md:text-[16px] md:leading-[1.45]">{finding}</p>}
        </header>

        {analytics.isLoading && <LoadingShape compact={phone} />}

        {analytics.isError && <LoadError message="The dashboard didn't load." onRetry={() => void analytics.refetch()} className="max-w-[560px] p-8" />}

        {data && (
          <>
            <UrgentBanner requests={urgent} compact={phone} />

            {phone ? (
              <>
                <PhoneTabs tab={tab} onTab={setTab} count={waiting} />
                {tab === 'today' ? (
                  <div role="tabpanel" id="panel-today" aria-labelledby="tab-today" className="flex flex-col gap-4">
                    {dayPanel}
                    {aheadChart(true)}
                    {bookingsChart(true)}
                    {dueSoonPanel(true)}
                  </div>
                ) : (
                  <div role="tabpanel" id="panel-waiting" aria-labelledby="tab-waiting">
                    {waitingPanel(true)}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className={SPLIT}>
                  <div className="flex min-w-0 flex-col gap-5">
                    {dayPanel}
                    {waitingPanel(false)}
                  </div>
                  <div className="flex min-w-0 flex-col gap-5">
                  <section aria-label="Calendar" className="min-w-0 rounded-2xl border border-line bg-surface px-[18px] pb-4 pt-3.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <h2 className="font-display text-[20px] font-semibold text-navy">{monthTitle(date)}</h2>
                      <div className="flex gap-1">
                        <button type="button" aria-label="Previous month" onClick={() => select(shiftMonth(date, -1))} className={ARROW}>
                          <ChevronLeft size={20} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label="Next month" onClick={() => select(shiftMonth(date, 1))} className={ARROW}>
                          <ChevronRight size={20} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <MonthGrid month={date} selected={date} today={today} days={schedule.data?.days ?? []} onSelect={select} />
                    {!isToday && (
                      <button
                        type="button"
                        onClick={() => select(today)}
                        className={cn(
                          'mt-2 inline-flex min-h-11 items-center rounded-md text-[14px] font-semibold text-navy underline underline-offset-[3px]',
                          FOCUS,
                        )}
                      >
                        Go to today
                      </button>
                    )}
                  </section>
                  {dueSoonPanel(false)}
                  </div>
                </div>

                <div className="grid grid-cols-1 items-stretch gap-5 @[880px]:grid-cols-2">
                  {aheadChart(false)}
                  {bookingsChart(false)}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {data && (
        <DaySheet
          date={date}
          day={day}
          travelBufferMinutes={schedule.data?.travelBufferMinutes ?? 0}
          urgent={urgent}
          printedBy={user?.fullName ?? 'the office'}
          printedAt={now}
        />
      )}

      {phone && <DatePicker open={pickerOpen} onOpenChange={setPickerOpen} selected={date} today={today} onApply={select} />}
    </AdminLayout>
  )
}
