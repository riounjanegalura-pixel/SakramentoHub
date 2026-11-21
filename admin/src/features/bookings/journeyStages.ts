import { awaitingPayment, holdLapsed, paymentHoldExpired } from '../../lib/domain'
import type { AdminBooking as Booking } from '../../lib/types'
import type { JourneyOutcome, JourneyStage } from '../../components/shared/JourneyRail'

export interface Journey {
  stages: JourneyStage[]
  /** Terminal or off-path rows after the stages (declined, cancelled, refund); empty on the normal path. */
  outcomes: JourneyOutcome[]
}

const PAID_FAMILY = ['paid', 'refund_due', 'refunded'] as const

/** No fee at all: nothing to pay, so Paid is never a step the person still has to do. */
function noFee(b: Booking): boolean {
  if (b.paymentStatus === 'not_required') return true
  if (b.amountDueCentavos === 0) return true
  // A sent booking with no payment record never needed one; a draft has simply not been priced yet.
  return b.paymentStatus === null && b.status !== 'draft'
}

function paidStage(b: Booking): Pick<JourneyStage, 'label' | 'state'> {
  if (noFee(b)) return { label: 'No payment needed', state: 'done' }
  const closed = b.status === 'declined' || b.status === 'cancelled'
  // On a booking that is not closed, refund_due means the money was never applied (it came after the hold lapsed,
  // was short, or reached a closed booking), and refunded means it went back: neither is "Paid".
  if (!closed && b.paymentStatus === 'refund_due') return { label: 'Payment not applied, refund due', state: 'future' }
  if (!closed && b.paymentStatus === 'refunded') return { label: 'Payment refunded', state: 'future' }
  if (b.paymentStatus && (PAID_FAMILY as readonly string[]).includes(b.paymentStatus)) return { label: 'Paid', state: 'done' }
  const unpaid = awaitingPayment(b.paymentStatus)
  // The same rule the detail screen uses: an open, unpaid booking whose hold ran out.
  const lapsed = holdLapsed(b) || (b.status === 'returned' && unpaid && paymentHoldExpired(b))
  if (lapsed) return { label: 'Payment window ended', state: 'future' }
  if (b.status === 'draft') return { label: 'Paid', state: 'future' }
  // Not "Paid" until the office records the cash.
  if (b.paymentStatus === 'pending_cash') return { label: 'Cash due at the parish office', state: 'future' }
  return { label: 'Payment due', state: 'future' }
}

/**
 * Maps a booking to the five journey stages (Requested, Under review, Paid, Confirmed, Completed).
 * Off-path states are explicit: a returned booking stays under review with a note; a declined or cancelled one
 * stops at the stages it reached and ends with a labelled outcome row; refunds get their own row.
 */
export function journeyStages(b: Booking): Journey {
  const paid = paidStage(b)
  const stage = (key: JourneyStage['key'], label: string, state: JourneyStage['state'], note?: string): JourneyStage =>
    note ? { key, label, state, note } : { key, label, state }

  if (b.status === 'declined' || b.status === 'cancelled') {
    const reached: JourneyStage[] = [stage('requested', 'Requested', 'done')]
    // A declined booking was reviewed; a cancelled one may have been withdrawn before any review.
    if (b.status === 'declined') reached.push(stage('review', 'Under review', 'done'))
    if (paid.state === 'done' && paid.label === 'Paid') reached.push(stage('paid', 'Paid', 'done'))
    const outcomes: JourneyOutcome[] = [
      { key: b.status, label: b.status === 'declined' ? 'Declined' : 'Cancelled', tone: 'danger' },
    ]
    if (b.paymentStatus === 'refund_due') outcomes.push({ key: 'refund', label: 'Refund due', tone: 'neutral' })
    if (b.paymentStatus === 'refunded') outcomes.push({ key: 'refund', label: 'Refunded', tone: 'neutral' })
    return { stages: reached, outcomes }
  }

  const outcomes: JourneyOutcome[] = []
  if (b.paymentStatus === 'refund_due') outcomes.push({ key: 'refund', label: 'Refund due', tone: 'neutral' })
  if (b.paymentStatus === 'refunded') outcomes.push({ key: 'refund', label: 'Refunded', tone: 'neutral' })

  switch (b.status) {
    case 'draft':
      return {
        stages: [
          stage('requested', 'Draft, not sent yet', 'current'),
          stage('review', 'Under review', 'future'),
          stage('paid', paid.label, paid.state),
          stage('confirmed', 'Confirmed', 'future'),
          stage('completed', 'Completed', 'future'),
        ],
        outcomes,
      }
    case 'submitted':
    case 'returned':
      return {
        stages: [
          stage('requested', 'Requested', 'done'),
          stage('review', 'Under review', 'current', b.status === 'returned' ? 'Changes requested' : undefined),
          stage('paid', paid.label, paid.state),
          stage('confirmed', 'Confirmed', 'future'),
          stage('completed', 'Completed', 'future'),
        ],
        outcomes,
      }
    case 'approved':
      return {
        stages: [
          stage('requested', 'Requested', 'done'),
          stage('review', 'Under review', 'done'),
          stage('paid', paid.label, paid.state),
          stage('confirmed', 'Confirmed', 'current'),
          stage('completed', 'Completed', 'future'),
        ],
        outcomes,
      }
    case 'completed':
      return {
        stages: [
          stage('requested', 'Requested', 'done'),
          stage('review', 'Under review', 'done'),
          // Shown as recorded: an unpaid fee on a completed booking stays visible rather than being called paid.
          stage('paid', paid.label, paid.state),
          stage('confirmed', 'Confirmed', 'done'),
          stage('completed', 'Completed', 'done'),
        ],
        outcomes,
      }
  }
}
