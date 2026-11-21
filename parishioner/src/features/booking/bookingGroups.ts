import { formatDate, formatTime, needsAction } from '../../lib/domain'
import type { Booking } from '../../lib/types'

export function scheduleText(b: Booking): string {
  if (b.isEmergency) return 'Urgent request'
  if (b.appointmentDate && b.appointmentStart) return `${formatDate(b.appointmentDate)} · ${formatTime(b.appointmentStart)}`
  return 'No date chosen yet'
}

export type BookingGroupTitle = 'Needs you' | 'Upcoming' | 'Drafts'

const FINISHED = ['completed', 'declined', 'cancelled']
const when = (b: Booking) => `${b.appointmentDate ?? ''}T${b.appointmentStart ?? ''}`

/**
 * There is no history list (client decision, 2026-10): the screen shows what still needs the parishioner. A finished,
 * declined or cancelled booking is not listed; a completed one lives on as a certificate in Wallet. A booking whose
 * date has passed but which the office has not completed yet stays under Upcoming, so it never disappears.
 */
function titleOf(b: Booking): BookingGroupTitle | null {
  if (needsAction(b) !== null) return 'Needs you'
  if (b.status === 'draft') return 'Drafts'
  if (FINISHED.includes(b.status)) return null
  return 'Upcoming'
}

const ORDER: Array<{ title: BookingGroupTitle; sort: (a: Booking, b: Booking) => number }> = [
  { title: 'Needs you', sort: (a, b) => when(a).localeCompare(when(b)) },
  { title: 'Upcoming', sort: (a, b) => when(a).localeCompare(when(b)) },
  { title: 'Drafts', sort: (a, b) => b.createdAt.localeCompare(a.createdAt) },
]

/** The non-empty sections in display order, each sorted. Shared by the phone list and the desktop master list. */
export function groupBookings(bookings: Booking[]): Array<{ title: BookingGroupTitle; items: Booking[] }> {
  return ORDER.map(({ title, sort }) => ({
    title,
    items: bookings.filter((b) => titleOf(b) === title).sort(sort),
  })).filter((g) => g.items.length > 0)
}
