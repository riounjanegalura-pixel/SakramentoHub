import { holdLapsed, needsAction } from '../../lib/domain'
import type { Booking } from '../../lib/types'
import { nextForYou } from './calendarItems'

export type NextAction =
  | { kind: 'pay'; booking: Booking; deadline: string | null; amountCentavos: number | null; cta: 'Review and pay' }
  | { kind: 'returned'; booking: Booking; note: string | null; cta: 'Review changes' }
  | { kind: 'upcoming'; booking: Booking; cta: 'View booking' }
  | { kind: 'lapsed'; booking: Booking; cta: 'View booking' }
  | { kind: 'none' }

/**
 * The single most important thing for this parishioner (spec section 12).
 * Money that runs out comes first (soonest deadline first), then changes the parish asked for,
 * then the next appointment (never a lapsed hold), then a lapsed hold explained. It reuses `nextForYou` for "what needs action" and "what is next".
 */
export function nextAction(bookings: Booking[], todayYmd: string): NextAction {
  const { next, needsAction: due } = nextForYou(bookings, todayYmd)

  const toPay = due
    .filter((b) => b.status === 'submitted')
    .sort((a, c) => (a.paymentHoldExpiresAt ?? '9999').localeCompare(c.paymentHoldExpiresAt ?? '9999'))
  if (toPay[0]) {
    const b = toPay[0]
    return { kind: 'pay', booking: b, deadline: b.paymentHoldExpiresAt, amountCentavos: b.amountDueCentavos, cta: 'Review and pay' }
  }

  const returned = due.find((b) => b.status === 'returned' && needsAction(b) !== null)
  if (returned) return { kind: 'returned', booking: returned, note: returned.returnNote ?? null, cta: 'Review changes' }

  // A lapsed payment hold is not an appointment: the server is about to release its slot.
  const lapsed = bookings.find((b) => holdLapsed(b))
  const upcoming = lapsed ? nextForYou(bookings.filter((b) => !holdLapsed(b)), todayYmd).next : next
  if (upcoming) return { kind: 'upcoming', booking: upcoming, cta: 'View booking' }
  if (lapsed) return { kind: 'lapsed', booking: lapsed, cta: 'View booking' }
  return { kind: 'none' }
}
