import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import type { BookingStatus } from '../../lib/types'
import { DateBlock } from './DateBlock'
import { Emblem, type EmblemKind } from './Emblem'
import { StatusPill } from './StatusPill'

/**
 * A booking as a ticket: a stub on the left (emblem and date, torn off along a dashed line), the booking on the
 * right (what, when, how it stands, and its register number). The date is optional because a draft has none yet.
 * With `to` the whole ticket is one link; without it the ticket is plain content.
 */
export function Ticket({
  kind,
  date,
  past = false,
  title,
  time,
  status,
  reference,
  to,
  className,
}: {
  kind: EmblemKind
  date?: Date | string | null
  past?: boolean
  title: string
  /** The time line under the title: "9:00 am", or "No date chosen yet" for a draft. */
  time?: string
  status: BookingStatus
  reference: string
  to?: string
  className?: string
}) {
  const classes = cn(
    'grid grid-cols-[7rem_minmax(0,1fr)] overflow-hidden rounded-2xl border border-line bg-surface text-ink',
    to && 'hover:border-navy',
    className,
  )
  const body = (
    <>
      <span
        data-slot="ticket-stub"
        className="flex flex-col items-center justify-center gap-2 border-r-2 border-dashed border-hollow bg-paper-deep px-2 py-3.5"
      >
        <Emblem kind={kind} size="sm" />
        {date ? <DateBlock date={date} past={past} /> : null}
      </span>
      <span className="flex min-w-0 flex-col items-start justify-center gap-1.5 p-4">
        <span className="font-display text-[1.375rem] leading-[1.2] font-semibold text-navy">{title}</span>
        {time ? <span className="text-note text-ink-muted">{time}</span> : null}
        <StatusPill status={status} />
        <span className="numeric text-label text-ink-muted">{reference}</span>
      </span>
    </>
  )
  return to ? (
    <Link to={to} data-slot="ticket" className={classes}>
      {body}
    </Link>
  ) : (
    <div data-slot="ticket" className={classes}>
      {body}
    </div>
  )
}
