import { createContext, forwardRef, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DayPicker, type DayButtonProps } from 'react-day-picker'
import { Loader2, AlertTriangle } from 'lucide-react'
import { fetchAvailabilityDays } from '../../lib/data/availability'
import { parishToday } from '../../lib/domain'
import { cn } from '../../lib/utils'
import type { RangeDay, Sacrament, ScheduleContext } from '../../lib/types'

/** `YYYY-MM-DD` (the form value format) for a local Date. */
function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Local-midnight Date for a `YYYY-MM-DD` string, or undefined if empty/malformed. */
function parseDateString(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

interface AppointmentDatePickerProps {
  sacrament: Sacrament
  /** Selected date as `YYYY-MM-DD`, or empty/undefined when none is picked. */
  value: string | undefined
  onChange: (value: string) => void
  /** Id of the visible label element, so the calendar group is announced by it. */
  labelId: string
  invalid?: boolean
  /** Booking answers that change which days are offered (Sunday session vs special, church vs house Mass). */
  context?: ScheduleContext
  /** The caller's own booking (being edited, or the saved draft), so it does not block its own slot. */
  excludeBookingId?: string
}

/** Reasons for unavailable days, keyed `YYYY-MM-DD`, read by each day button. */
const ReasonContext = createContext<Map<string, string>>(new Map())

/**
 * Calendar-grid date picker for every booking wizard's schedule step.
 * Each visible day is colored by the server's rule-based status for that
 * sacrament (one availability-days request per visible month):
 * no color = free, yellow = few times left, red = fully booked or not
 * offered (with the reason announced and listed under the calendar).
 * Full, unavailable and past days are not selectable.
 */
export const AppointmentDatePicker = forwardRef<HTMLDivElement, AppointmentDatePickerProps>(
  function AppointmentDatePicker({ sacrament, value, onChange, labelId, invalid, context, excludeBookingId }, ref) {
    const todayYmd = parishToday()
    const today = parseDateString(todayYmd)!
    const selected = parseDateString(value)
    const [month, setMonth] = useState<Date>(() => startOfMonth(selected ?? today))

    const start = toDateString(month)
    const end = toDateString(new Date(month.getFullYear(), month.getMonth() + 1, 0))

    const { data, isLoading, isError } = useQuery({
      queryKey: ['availability-days', sacrament, start, end, context ?? {}, excludeBookingId ?? null],
      queryFn: () => fetchAvailabilityDays(sacrament, start, end, context ?? {}, excludeBookingId),
    })

    const { full, limited, unavailable, reasons } = useMemo(() => {
      const full: Date[] = []
      const limited: Date[] = []
      const unavailable: Date[] = []
      const reasons = new Map<string, string>()
      for (const day of (data ?? []) as RangeDay[]) {
        const date = parseDateString(day.date)
        if (!date) continue
        if (day.status === 'full') full.push(date)
        else if (day.status === 'limited') limited.push(date)
        else if (day.status === 'unavailable') unavailable.push(date)
        if (day.reason) reasons.set(day.date, day.reason)
      }
      return { full, limited, unavailable, reasons }
    }, [data])

    // Each distinct reason once, for upcoming days only ("already passed" is obvious).
    const upcomingReasons = useMemo(
      () => [...new Set([...reasons].filter(([date]) => date >= todayYmd).map(([, reason]) => reason))],
      [reasons, todayYmd],
    )

    return (
      <div
        ref={ref}
        tabIndex={-1}
        role="group"
        aria-labelledby={labelId}
        aria-invalid={invalid || undefined}
        className={cn(
          'mb-1 rounded-xl border bg-surface p-3 outline-none',
          invalid ? 'border-danger' : 'border-input-border',
        )}
      >
        <ReasonContext.Provider value={reasons}>
          <DayPicker
            mode="single"
            today={today}
            selected={selected}
            onSelect={(date) => onChange(date ? toDateString(date) : '')}
            month={month}
            onMonthChange={setMonth}
            startMonth={startOfMonth(today)}
            disabled={[{ before: today }, ...full, ...unavailable]}
            modifiers={{ full, limited, unavailable, past: { before: today } }}
            labels={{
              labelDayButton: (date, modifiers) => {
                const base = date.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })
                const notes = [
                  modifiers.today && 'today',
                  modifiers.full && 'fully booked',
                  modifiers.limited && 'limited times',
                  modifiers.unavailable && (reasons.get(toDateString(date)) ?? 'not available'),
                  modifiers.selected && 'selected',
                ].filter(Boolean)
                return notes.length ? `${base}, ${notes.join(', ')}` : base
              },
            }}
            components={{ DayButton: AvailabilityDayButton }}
            classNames={{
              root: 'relative w-full',
              months: 'w-full',
              month: 'w-full',
              month_caption: 'flex h-12 items-center px-1',
              caption_label: 'font-display text-[1.375rem] font-semibold text-navy',
              nav: 'absolute right-0 top-0 flex items-center gap-1',
              button_previous:
                'flex h-11 w-11 items-center justify-center rounded-lg text-navy hover:bg-line/40 disabled:pointer-events-none disabled:opacity-30',
              button_next:
                'flex h-11 w-11 items-center justify-center rounded-lg text-navy hover:bg-line/40 disabled:pointer-events-none disabled:opacity-30',
              chevron: 'h-4 w-4 fill-current',
              month_grid: 'mt-2 w-full border-collapse',
              weekdays: '',
              weekday: 'pb-1 text-center text-label font-semibold text-ink-muted',
              week: '',
              day: 'p-0 text-center',
            }}
          />
        </ReasonContext.Provider>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-muted">
          {isLoading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              Checking availability…
            </span>
          ) : isError ? (
            <span className="flex items-center gap-1.5 text-danger">
              <AlertTriangle size={14} aria-hidden="true" />
              Couldn&apos;t load availability for this month.
            </span>
          ) : (
            <>
              <LegendSwatch className="rounded-full border-2 border-navy bg-surface" label="Available" />
              <LegendSwatch className="rounded-full border-2 border-navy bg-status-pending-bg" label="Few times left" />
              <LegendSwatch className="rounded-full border-[1.5px] border-dashed border-hollow bg-surface" label="Fully booked or not offered" />
            </>
          )}
        </div>

        {!isLoading && !isError && upcomingReasons.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-label text-danger">
            {upcomingReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
    )
  },
)

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('inline-block h-3 w-3 rounded', className)} aria-hidden="true" />
      {label}
    </span>
  )
}

/** Day cell button: availability color + brand-styled selected/today states.
 * Mirrors the library's default DayButton focus handling for keyboard nav. */
function AvailabilityDayButton({ day, modifiers, className, ...buttonProps }: DayButtonProps) {
  const reasons = useContext(ReasonContext)
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const isPast = !!modifiers.past
  const status = isPast ? 'past' : modifiers.full ? 'full' : modifiers.limited ? 'limited' : modifiers.unavailable ? 'unavailable' : 'free'

  return (
    <button
      ref={ref}
      {...buttonProps}
      title={status === 'unavailable' ? reasons.get(toDateString(day.date)) : status === 'full' ? 'Fully booked' : undefined}
      data-status={status}
      className={cn(
        className,
        'mx-auto flex h-11 w-full min-w-0 max-w-11 items-center justify-center rounded-full text-body tabular-nums',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
        !modifiers.disabled && 'text-ink hover:bg-paper-deep',
        modifiers.today && 'font-semibold text-navy',
        (status === 'free' || status === 'limited') && 'border-2 border-navy font-bold text-navy',
        (status === 'full' || status === 'unavailable') && 'cursor-not-allowed border-[1.5px] border-dashed border-hollow text-ink-muted line-through',
        isPast && 'cursor-not-allowed text-ink-muted opacity-60',
        modifiers.selected && 'border-navy bg-navy font-bold text-white no-underline hover:bg-navy',
      )}
    />
  )
}
