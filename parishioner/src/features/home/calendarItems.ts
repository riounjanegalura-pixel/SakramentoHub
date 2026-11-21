import { SACRAMENT_LABEL, needsAction as bookingNeedsAction } from '../../lib/domain'
import type { Booking } from '../../lib/types'

/** A booking holds its date the way the server's slot guard does: a draft is mid-wizard, declined and cancelled gave the date up. */
const HELD_STATUSES = ['submitted', 'returned', 'approved', 'completed']

export interface CalendarItem {
  id: string
  title: string
  date: Date
  isOwnBooking: boolean
  /** Set on the parishioner's own appointments, so the schedule can draw them as tickets. */
  booking?: Booking
}

type EventLike = { id: string; title: string; date: string }

export function buildCalendarItems(events: EventLike[] | undefined, bookings: Booking[] | undefined): CalendarItem[] {
  const eventItems = (events ?? []).map((e) => ({ id: e.id, title: e.title, date: new Date(e.date), isOwnBooking: false }))
  const bookingItems = (bookings ?? [])
    .filter((x) => HELD_STATUSES.includes(x.status) && x.appointmentDate)
    .map((x) => ({
      id: x.id,
      title: `${SACRAMENT_LABEL[x.sacrament]} — Your Booking`,
      // Local wall-clock time: "YYYY-MM-DDTHH:mm" without a Z is parsed as local, not UTC.
      date: new Date(`${x.appointmentDate}T${x.appointmentStart ?? '00:00'}:00`),
      isOwnBooking: true,
      booking: x,
    }))
  return [...eventItems, ...bookingItems]
}

const ACTIVE = ['submitted', 'returned', 'approved']

export function nextForYou(bookings: Booking[], todayYmd: string): { next: Booking | null; needsAction: Booking[] } {
  const upcoming = bookings
    .filter((x) => ACTIVE.includes(x.status) && x.appointmentDate && x.appointmentDate >= todayYmd)
    .sort((a, c) => `${a.appointmentDate}T${a.appointmentStart ?? '00:00'}`.localeCompare(`${c.appointmentDate}T${c.appointmentStart ?? '00:00'}`))
  const needsAction = bookings.filter((x) => bookingNeedsAction(x) !== null)
  return { next: upcoming[0] ?? null, needsAction }
}
