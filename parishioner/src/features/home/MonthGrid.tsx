import { cn } from '../../lib/utils'

interface MonthGridProps {
  month: Date
  /** One entry per item, so a day with two items appears twice. */
  markedDates: Date[]
  selectedDate: Date | null
  onSelectDate: (date: Date) => void
}

// Saturday uses "Sa" (not "S") so each weekday header cell has distinct text.
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'Sa']
const DAY_NAME = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * The month as a grid of days (spec section 12). Today is ringed navy (2 px); the selected day is filled navy
 * with white text. Each day is a 44 px target named by its date and item count; the dot is decoration only.
 */
export function MonthGrid({ month, markedDates, selectedDate, onSelectDate }: MonthGridProps) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstDayOfMonth = new Date(year, monthIndex, 1)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const leadingBlanks = firstDayOfMonth.getDay()
  const today = new Date()

  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
  ]

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 text-center text-label font-semibold text-ink-muted" aria-hidden="true">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center text-sm">
        {cells.map((date, i) => {
          if (!date) return <span key={i} />
          const count = markedDates.filter((d) => isSameDay(d, date)).length
          const isToday = isSameDay(today, date)
          const isSelected = selectedDate ? isSameDay(selectedDate, date) : false
          const name = count > 0 ? `${DAY_NAME.format(date)}, ${count} ${count === 1 ? 'item' : 'items'}` : DAY_NAME.format(date)
          return (
            <button
              key={i}
              type="button"
              data-marked={count > 0}
              aria-label={name}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => onSelectDate(date)}
              className="relative flex h-11 w-full items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
            >
              <span
                data-day
                className={cn(
                  'flex size-8 items-center justify-center rounded-full',
                  isSelected ? 'bg-navy font-semibold text-white' : 'text-ink',
                  isToday && 'ring-2 ring-navy',
                  isToday && isSelected && 'ring-offset-2 ring-offset-surface',
                  isToday && !isSelected && 'font-semibold',
                )}
              >
                {date.getDate()}
              </span>
              {count > 0 && <span className="absolute bottom-0.5 size-1 rounded-full bg-navy" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-label text-ink-muted" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-navy" /> Has an event
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full ring-2 ring-navy" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-navy" /> Selected
        </span>
      </div>
    </div>
  )
}
