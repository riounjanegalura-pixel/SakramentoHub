import { awaitingPayment, formatTime, holdLapsed, paymentHoldExpired, peso } from '../../lib/domain'
import type { AdminBooking, BookingDocument, BookingStatus, PaymentStatus } from '../../lib/types'

/** The four views along the top of the queue. Each is one status filter, so a view is just a link to `?status=`. */
export type ViewKey = 'waiting' | 'upcoming' | 'completed' | 'all'

export const VIEWS: ReadonlyArray<{ key: ViewKey; label: string; status: BookingStatus | '' }> = [
  { key: 'waiting', label: 'Waiting for me', status: 'submitted' },
  { key: 'upcoming', label: 'Upcoming', status: 'approved' },
  { key: 'completed', label: 'Completed', status: 'completed' },
  { key: 'all', label: 'All', status: '' },
]

/** Which view a status filter is: exactly one status that has a tab, or none; any other mix is no tab at all. */
export function viewKeyFor(statuses: readonly BookingStatus[]): ViewKey | null {
  if (statuses.length === 0) return 'all'
  if (statuses.length > 1) return null
  return VIEWS.find((v) => v.status === statuses[0])?.key ?? null
}

/** "Dec 14, 10:00 AM" for a dated booking; a plain reason when there is no time. */
export function whenText(b: Pick<AdminBooking, 'isEmergency' | 'appointmentDate' | 'appointmentStart'>): string {
  if (b.isEmergency) return 'No time: urgent'
  if (b.appointmentDate && b.appointmentStart) {
    const day = new Date(`${b.appointmentDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${day}, ${formatTime(b.appointmentStart)}`
  }
  return 'No time yet'
}

export type PayTone = 'ok' | 'warn' | 'bad' | 'mute'

/** The Payment column: one word and a tone, so colour is never the only signal. */
export function paymentCell(b: Pick<AdminBooking, 'paymentStatus'>): { label: string; tone: PayTone } {
  const s: PaymentStatus | null = b.paymentStatus
  switch (s) {
    case 'paid':
      return { label: 'Paid', tone: 'ok' }
    case 'unpaid':
      return { label: 'Unpaid', tone: 'warn' }
    case 'pending_cash':
      return { label: 'Cash due', tone: 'warn' }
    case 'refund_due':
      return { label: 'Refund due', tone: 'bad' }
    case 'refunded':
      return { label: 'Refunded', tone: 'mute' }
    case 'void':
      return { label: 'Void', tone: 'mute' }
    default:
      return { label: 'No fee', tone: 'mute' }
  }
}

export const firstName = (full: string | null | undefined): string => (full ?? '').trim().split(/\s+/)[0] || 'the parishioner'

/** "in 25 minutes", "in 2 hours", "in 3 days" from a number of minutes; null once it has passed. */
function inWords(minutes: number): string | null {
  if (minutes <= 0) return null
  if (minutes < 60) return `in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const days = Math.round(hours / 24)
  return `in ${days} days`
}

/** How long the payment hold has left, in words, or null when there is none or it has ended. */
export function holdLeft(b: Pick<AdminBooking, 'paymentHoldExpiresAt'>, now = Date.now()): string | null {
  if (!b.paymentHoldExpiresAt) return null
  return inWords(Math.floor((Date.parse(b.paymentHoldExpiresAt) - now) / 60000))
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Uploaded files the office has not reviewed yet. */
export const unreviewedDocs = (b: Pick<AdminBooking, 'documents'>): BookingDocument[] => b.documents.filter((d) => d.url !== null && d.review === null)
const uploadedDocs = (b: Pick<AdminBooking, 'documents'>): BookingDocument[] => b.documents.filter((d) => d.url !== null)

/** The Next step column: the one thing that moves this booking on, in words. Presentation only; no rule changes. */
export function nextStep(b: AdminBooking, now = Date.now(), today = ''): string {
  const refund = (b.amountPaidCentavos ?? b.amountDueCentavos ?? 0) - b.amountRefundedCentavos
  if (b.paymentStatus === 'refund_due') return `Record the ${peso(refund)} refund`
  switch (b.status) {
    case 'draft':
      return 'Not sent yet'
    case 'declined':
    case 'cancelled':
    case 'completed':
      return 'Nothing left to do'
    case 'returned':
      return b.channel === 'walk_in' ? 'Waiting for changes at the office desk' : `Waiting for ${firstName(b.user.fullName)} to send changes`
    case 'submitted': {
      if (b.isEmergency) return 'Call the family now, then review'
      // Approval first: the fee is settled after approving, so a submitted booking goes straight to review.
      if (awaitingPayment(b.paymentStatus) && !b.paymentAfterApproval) {
        const left = holdLeft(b, now)
        return left ? `Take payment. Hold ends ${left}` : 'Payment window ended'
      }
      const n = unreviewedDocs(b).length
      if (n > 0) return `Review ${plural(n, 'document', 'documents')}`
      if (b.documents.some((d) => d.review?.status === 'rejected')) return 'Send back for the rejected document'
      return 'Approve or send back'
    }
    case 'approved': {
      if (awaitingPayment(b.paymentStatus)) {
        const left = holdLeft(b, now)
        if (b.paymentAfterApproval && b.channel !== 'walk_in') {
          return left ? `Waiting for ${firstName(b.user.fullName)} to pay. Hold ends ${left}` : `Waiting for ${firstName(b.user.fullName)} to pay`
        }
        return left ? `Take payment. Hold ends ${left}` : 'Take payment'
      }
      if (b.checkedInAt) return 'Mark completed after the ceremony'
      if (b.appointmentDate && today && b.appointmentDate > today) return 'Ready for the appointment day'
      return b.appointmentDate ? 'Check in, then mark completed' : 'Mark completed after the ceremony'
    }
  }
}

/** What blocks Approve, per payment status. Mirrors BookingStateMachine::approve: paid, no fee or no payment record only. */
const PAYMENT_BLOCK: Partial<Record<PaymentStatus, { text: string; sub: string; action?: 'payment' }>> = {
  unpaid: { text: 'Take the payment', sub: 'Waiting for the GCash payment, or cash at the office.', action: 'payment' },
  pending_cash: { text: 'Take the cash payment', sub: 'The parishioner chose to pay cash at the parish office.', action: 'payment' },
  refund_due: { text: 'Refund the payment', sub: 'Payment needs a refund before this can be approved.' },
  refunded: { text: 'Payment was refunded', sub: 'This booking cannot be approved after a refund.' },
  void: { text: 'Payment was voided', sub: 'This booking cannot be approved with a voided payment.' },
}

export interface ApprovalCheck {
  key: 'payment' | 'documents' | 'time'
  ok: boolean
  text: string
  sub?: string
  /** What the link beside an open item does. */
  action?: { label: string; kind: 'documents' | 'payment' }
}

export interface Approval {
  checks: ApprovalCheck[]
  /** Items still open. Approve is blocked while this is above zero, and the list says why in words. */
  left: number
}

/** The visible checklist behind Approve: payment, every uploaded document reviewed, and the time still held. */
export function approvalChecks(b: AdminBooking): Approval {
  const checks: ApprovalCheck[] = []

  const blocked = b.paymentStatus ? PAYMENT_BLOCK[b.paymentStatus] : undefined
  // Approval first: an unpaid or cash-pending fee is settled after approving, so it does not hold Approve back.
  const payLater = b.paymentAfterApproval === true && awaitingPayment(b.paymentStatus)
  if (payLater) {
    checks.push({ key: 'payment', ok: true, text: 'Payment comes after approval', sub: 'The parishioner pays once you approve.' })
  } else if (blocked) {
    checks.push({ key: 'payment', ok: false, text: blocked.text, sub: blocked.sub, action: blocked.action ? { label: 'Take payment', kind: 'payment' } : undefined })
  } else {
    const noFee = b.paymentStatus === null || b.paymentStatus === 'not_required' || b.amountDueCentavos === 0
    checks.push({ key: 'payment', ok: true, text: noFee ? 'No payment needed' : 'Payment received' })
  }

  const uploaded = uploadedDocs(b)
  if (uploaded.length > 0) {
    // Mirrors Booking::documentsCleared(): every uploaded file must have an accepted review.
    const accepted = uploaded.filter((d) => d.review?.status === 'accepted').length
    const ok = accepted === uploaded.length
    checks.push(
      ok
        ? { key: 'documents', ok: true, text: 'Every uploaded document reviewed' }
        : {
            key: 'documents',
            ok: false,
            text: 'Review every uploaded document',
            sub: `${accepted} of ${uploaded.length} accepted`,
            action: { label: 'Review documents', kind: 'documents' },
          },
    )
  }

  if (b.appointmentDate && !b.isEmergency) {
    const lapsed = holdLapsed(b) || (awaitingPayment(b.paymentStatus) && paymentHoldExpired(b))
    checks.push(
      lapsed
        ? { key: 'time', ok: false, text: 'The time is no longer held', sub: 'The payment window ended, so the slot was released.' }
        : { key: 'time', ok: true, text: 'Time is free' },
    )
  }

  return { checks, left: checks.filter((c) => !c.ok).length }
}

export const leftText = (left: number) => `${left} ${left === 1 ? 'thing' : 'things'} left before you can approve.`

export type PillTone = 'pending' | 'confirmed' | 'done' | 'rejected' | 'neutral'

/** A document's state in words, with the tone its pill is drawn in. */
export function docState(d: BookingDocument): { label: string; tone: PillTone; icon: 'clock' | 'check' | 'none' | 'alert' } {
  if (d.url === null) return { label: 'Not uploaded', tone: 'neutral', icon: 'none' }
  if (d.review === null) return { label: 'Not reviewed', tone: 'pending', icon: 'clock' }
  if (d.review.status === 'accepted') return { label: 'Accepted', tone: 'done', icon: 'check' }
  return { label: 'Rejected', tone: 'rejected', icon: 'alert' }
}

/** "PDF · Nov 1" is not on the API, so the meta line says what the office does know. */
export function docMeta(d: BookingDocument): string {
  if (d.url === null) return d.required ? 'Required' : 'Optional, can be added later'
  const ext = /\.(pdf|jpe?g|png)$/i.exec(d.url)?.[1].toUpperCase().replace('JPEG', 'JPG')
  return [ext, d.required ? 'Required' : 'Optional'].filter(Boolean).join(' · ')
}
