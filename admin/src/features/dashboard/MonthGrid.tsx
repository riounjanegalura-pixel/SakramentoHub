import { monthGrid } from '../../lib/dates'
import { cn } from '../../lib/utils'
import type { ScheduleDay } from '../../lib/types'

export const WEEKDAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function visitCount(day: ScheduleDay | undefined): number {
  return day ? day.items.filter((i) => i.type === 'booking').length : 0
}

/** A closure with a time window shuts only part of the day, so it does not strike the day through. */
const wholeDay = (day: ScheduleDay) => day.blackouts.filter((b) => !b.start)

export function isClosed(day: ScheduleDay | undefined): boolean {
  return !!day && wholeDay(day).length > 0
}

function cellLabel(date: string, day: ScheduleDay | undefined): string {
  const name = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
  const n = visitCount(day)
  const closed = isClosed(day) ? `, parish closed: ${wholeDay(day!).map((b) => b.reason).join('; ')}` : ''
  return `${name}${closed}${n > 0 ? `, ${n} ${n === 1 ? 'visit' : 'visits'}` : ''}`
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * The month as a grid of days. A navy dot marks a day with visits and a strike-through marks a closed day, so the
 * numbers never carry meaning alone. The selected day is filled pale blue with a 2 px navy border and aria-pressed.
 */
export function MonthGrid({
  month,
  selected,
  today,
  days,
  onSelect,
  cellClass = 'h-11',
}: {
  /** Any date inside the month to draw. */
  month: string
  selected: string
  today: string
  days: ScheduleDay[]
  onSelect: (date: string) => void
  cellClass?: string
}) {
  const byDate = new Map(days.map((d) => [d.date, d]))
  return (
    <>
      <div aria-hidden="true" className="mb-1 grid grid-cols-7 text-center text-[13px] font-medium text-ink-muted">
        {WEEKDAYS_SHORT.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 justify-items-center gap-0.5">
        {monthGrid(month)
          .flat()
          .map((cell, i) => {
            if (cell === null) return <span key={`pad-${i}`} aria-hidden="true" />
            const day = byDate.get(cell)
            const sel = cell === selected
            const closed = isClosed(day)
            return (
              <button
                key={cell}
                type="button"
                aria-label={cellLabel(cell, day)}
                aria-pressed={sel}
                aria-current={cell === today ? 'date' : undefined}
                onClick={() => onSelect(cell)}
                className={cn(
                  'relative w-full max-w-[44px] rounded-[10px] border-2 text-[15px]',
                  FOCUS,
                  cellClass,
                  sel ? 'border-navy bg-status-confirmed-bg font-semibold' : 'border-transparent font-normal hover:bg-paper',
                  closed ? 'text-ink-muted line-through' : 'text-ink',
                  cell === today && !sel && 'underline decoration-navy decoration-2 underline-offset-4',
                )}
              >
                {Number(cell.slice(8))}
                {visitCount(day) > 0 && <span aria-hidden="true" className="absolute bottom-[5px] left-1/2 -ml-[2.5px] size-[5px] rounded-full bg-navy" />}
              </button>
            )
          })}
      </div>
    </>
  )
}
