import { format, parseISO } from 'date-fns'
import { cn } from '../../lib/utils'

/**
 * Weekday, big day number, month: the stub a date leaves in the margin of a register. Read aloud it is one
 * date ("Saturday 7 November"), so the three visual pieces are hidden from a screen reader and one
 * visually hidden line inside the <time> element carries the full date instead.
 */
export function DateBlock({
  date,
  size = 'md',
  past = false,
  decorative = false,
  className,
}: {
  date: Date | string
  size?: 'md' | 'lg'
  /** A date already gone: the number steps back to the muted ink. */
  past?: boolean
  /** A stub beside text that already says the date (an event row with its own <time>): hidden from a screen reader. */
  decorative?: boolean
  className?: string
}) {
  const d = typeof date === 'string' ? parseISO(date) : date
  if (decorative) {
    return (
      <span data-slot="date-block" aria-hidden="true" className={cn('grid justify-items-center text-center leading-none', className)}>
        <DateParts d={d} size={size} past={past} />
      </span>
    )
  }
  return (
    <time
      data-slot="date-block"
      dateTime={format(d, 'yyyy-MM-dd')}
      className={cn('grid justify-items-center text-center leading-none', className)}
    >
      <span className="sr-only">{format(d, 'EEEE d MMMM')}</span>
      <DateParts d={d} size={size} past={past} hidden />
    </time>
  )
}

function DateParts({ d, size, past, hidden = false }: { d: Date; size: 'md' | 'lg'; past: boolean; hidden?: boolean }) {
  const aria = hidden ? ({ 'aria-hidden': true } as const) : {}
  return (
    <>
      <span {...aria} className="text-label font-semibold text-ink-muted">
        {format(d, 'EEE')}
      </span>
      <span
        {...aria}
        className={cn(
          'my-0.5 font-bold tracking-tight whitespace-nowrap tabular-nums',
          size === 'lg' ? 'text-[3.25rem] leading-[3.375rem]' : 'text-[2.375rem] leading-10',
          past ? 'text-ink-muted' : 'text-ink',
        )}
      >
        {format(d, 'd')}
      </span>
      <span {...aria} className="text-label font-semibold text-ink-muted">
        {format(d, 'MMM')}
      </span>
    </>
  )
}
