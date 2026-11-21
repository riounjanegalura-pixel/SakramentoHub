import { DateBlock } from '../../components/shared/DateBlock'
import { Ticket } from '../../components/shared/Ticket'
import { formatTime } from '../../lib/domain'
import type { CalendarItem } from './calendarItems'

const DAY = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })
const TIME = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' })

/**
 * One line of the schedule. A parish event is a date stub, a ruled margin and the words; the parishioner's own
 * appointment is a Ticket (the same card as on Home and in My bookings), so a booking never looks like a Mass time.
 */
export function ScheduleRow({ item, withDay = true }: { item: CalendarItem; withDay?: boolean }) {
  const { booking } = item
  if (item.isOwnBooking && booking) {
    return (
      <Ticket
        kind={booking.sacrament}
        date={item.date}
        title={item.title}
        time={booking.appointmentStart ? formatTime(booking.appointmentStart) : TIME.format(item.date)}
        status={booking.status}
        reference={booking.referenceNumber}
        to={`/booking/history/${booking.id}`}
      />
    )
  }
  return (
    <div className="flex min-h-16 items-center gap-4 px-1 py-3">
      <DateBlock date={item.date} decorative className="w-14 shrink-0" />
      <span aria-hidden="true" className="self-stretch border-l border-line" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink">{item.title}</p>
        <p className="tabular-nums text-note text-ink-muted">
          <time dateTime={item.date.toISOString()} className="tabular-nums">
            {withDay ? `${DAY.format(item.date)} · ` : ''}
            {TIME.format(item.date)}
          </time>
        </p>
      </div>
    </div>
  )
}
