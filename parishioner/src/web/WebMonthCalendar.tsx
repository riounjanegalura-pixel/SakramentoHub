import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CalendarItem } from '../features/home/calendarItems'
import { cn } from '../lib/utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' })
const DAY = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

interface Props {
  month: Date
  items: CalendarItem[]
  selected: Date | null
  onSelect: (d: Date) => void
  onMonthChange: (delta: -1 | 1) => void
}

export function WebMonthCalendar({ month, items, selected, onSelect, onMonthChange }: Props) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: Array<Date | null> = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const today = new Date()
  return (
    <section aria-label="Calendar" className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">{MONTH.format(month)}</h2>
        <div className="flex gap-1">
          <button type="button" aria-label="Previous month" onClick={() => onMonthChange(-1)} className="flex size-11 items-center justify-center rounded-full hover:bg-paper focus-visible:outline-2 focus-visible:outline-focus"><ChevronLeft size={18} aria-hidden="true" /></button>
          <button type="button" aria-label="Next month" onClick={() => onMonthChange(1)} className="flex size-11 items-center justify-center rounded-full hover:bg-paper focus-visible:outline-2 focus-visible:outline-focus"><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px text-center text-label font-semibold text-ink-muted">
        {WEEKDAYS.map((d) => <span key={d} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-line">
        {cells.map((date, i) => {
          if (!date) return <span key={i} className="min-h-24 bg-paper" />
          const todays = items.filter((it) => same(it.date, date))
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(date)}
              aria-label={todays.length ? `${DAY.format(date)}, ${todays.length} ${todays.length === 1 ? 'item' : 'items'}` : DAY.format(date)}
              aria-current={same(date, today) ? 'date' : undefined}
              aria-pressed={selected !== null && same(date, selected)}
              className={cn('flex min-h-24 flex-col items-start gap-1 bg-surface p-2 text-left text-sm hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus', selected && same(date, selected) && 'ring-2 ring-inset ring-navy')}
            >
              <span data-day className={cn('flex size-7 items-center justify-center rounded-full text-label font-semibold text-ink', same(date, today) && 'ring-2 ring-navy', selected !== null && same(date, selected) && 'bg-navy text-white', selected !== null && same(date, selected) && same(date, today) && 'ring-offset-2 ring-offset-surface')}>{date.getDate()}</span>
              {todays.slice(0, 2).map((it) => (
                <span key={it.id} className={cn('w-full truncate rounded px-1 text-label', it.isOwnBooking ? 'bg-status-pending-bg text-navy' : 'bg-paper text-ink')}>{it.title}</span>
              ))}
              {todays.length > 2 && <span className="text-label text-ink-muted">+{todays.length - 2} more</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}
