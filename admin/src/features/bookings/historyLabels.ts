import { peso } from '../../lib/domain'
import type { AuditLogEntry } from '../../lib/types'

const TITLES: Record<string, string> = {
  'booking.submitted': 'Submitted',
  'booking.resubmitted': 'Resubmitted',
  'booking.returned': 'Returned for changes',
  'booking.approved': 'Approved',
  'booking.declined': 'Declined',
  'booking.cancelled': 'Cancelled',
  'booking.completed': 'Marked completed',
  'booking.rescheduled': 'Rescheduled by the parishioner',
  'booking.rescheduled_by_staff': 'Rescheduled by the office',
  'booking.payment_confirmed': 'GCash payment confirmed',
  'booking.cash_chosen': 'Chose to pay cash at the parish office',
  'booking.cash_received': 'Cash received',
  'booking.payment_extra': 'Extra payment received',
  'booking.payment_on_closed_booking': 'Payment received after the booking closed',
  'booking.refunded': 'Refund recorded',
  'booking.partial_refund': 'Partial refund recorded',
  'booking.overpaid': 'Overpayment flagged',
  'document.accepted': 'Document accepted',
  'document.rejected': 'Document rejected',
  'milestone.ticked': 'Preparation step done',
  'milestone.unticked': 'Preparation step undone',
  'document.attached_late': 'Document added at the desk',
  'booking.checked_in': 'Checked in',
  'certificate.generated': 'Certificate generated',
  'register.recorded': 'Added to the register',
  'register.transcribed': 'Copied from the paper book',
  'register.corrected': 'Corrected',
  'register.paper_reference': 'Paper reference changed',
  'register.revoked': 'Revoked',
  'register.reinstated': 'Reinstated',
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const amount = (v: unknown): string | null => (typeof v === 'number' ? peso(v) : null)

/** One timeline row: a plain-English title and, where the audit entry carries one, the detail staff care about. */
export function describeHistory(entry: AuditLogEntry): { title: string; detail: string | null } {
  const m = entry.metadata
  const title = TITLES[entry.action] ?? entry.action

  switch (entry.action) {
    case 'booking.returned':
      return { title, detail: text(m.note) }
    case 'booking.declined':
    case 'booking.cancelled':
      return { title, detail: text(m.reason) ?? text(m.note) }
    case 'booking.submitted':
    case 'booking.resubmitted':
      return { title, detail: m.leadTimeWaived === true ? `Lead time waived: ${text(m.waiveReason) ?? 'no reason recorded'}` : null }
    case 'booking.rescheduled_by_staff': {
      const from = [text(m.fromDate), text(m.fromStart)].filter(Boolean).join(' ')
      const to = [text(m.date), text(m.start)].filter(Boolean).join(' ')
      const reason = text(m.reason)
      return { title, detail: `${from} → ${to}${reason ? `. ${reason}` : ''}${m.leadTimeWaived === true ? ' (lead time waived)' : ''}` }
    }
    case 'document.accepted':
    case 'document.rejected':
      return { title, detail: [text(m.label), text(m.note)].filter(Boolean).join(' — ') || null }
    case 'milestone.ticked':
    case 'milestone.unticked':
      return { title, detail: [text(m.label), text(m.note) ?? text(m.reason)].filter(Boolean).join(' — ') || null }
    case 'document.attached_late':
      return { title, detail: text(m.label) }
    case 'booking.cash_received':
      return { title, detail: [amount(m.amountCentavos), text(m.receiptReference) ? `receipt ${text(m.receiptReference)}` : null].filter(Boolean).join(' · ') || null }
    case 'booking.refunded':
      return { title, detail: text(m.reference) ? `Reference ${text(m.reference)}` : null }
    case 'booking.partial_refund':
      return { title, detail: [amount(m.amountCentavos), text(m.reference) ? `reference ${text(m.reference)}` : null].filter(Boolean).join(' · ') || null }
    case 'register.corrected':
    case 'register.revoked':
    case 'register.reinstated':
      return { title, detail: text(m.reason) }
    case 'register.paper_reference': {
      const after = (m.after ?? {}) as Record<string, unknown>
      const parts = [
        text(after.bookNo) ? `book ${text(after.bookNo)}` : null,
        text(after.pageNo) ? `page ${text(after.pageNo)}` : null,
        text(after.lineNo) ? `line ${text(after.lineNo)}` : null,
      ].filter((p): p is string => p !== null)
      const line = parts.join(', ')
      return { title, detail: line ? line.charAt(0).toUpperCase() + line.slice(1) : 'Cleared' }
    }
    case 'booking.overpaid':
      return { title, detail: amount(m.overpaidCentavos) ? `Overpaid by ${amount(m.overpaidCentavos)}` : null }
    default:
      return { title, detail: null }
  }
}
