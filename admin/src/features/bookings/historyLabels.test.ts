import { describe, expect, it } from 'vitest'
import { describeHistory } from './historyLabels'
import type { AuditLogEntry } from '../../lib/types'

const entry = (action: string, metadata: Record<string, unknown> = {}, o: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: action, action, subjectType: 'booking', subjectId: 'b1', metadata,
  actor: { id: 's1', fullName: 'Staff One', email: 's@example.com' }, createdAt: '2026-11-02T01:00:00Z', ...o,
})

describe('describeHistory', () => {
  it.each([
    [entry('booking.submitted'), 'Submitted', null],
    [entry('booking.returned', { note: 'Fix the address' }), 'Returned for changes', 'Fix the address'],
    [entry('booking.declined', { reason: 'Not eligible' }), 'Declined', 'Not eligible'],
    [entry('document.rejected', { label: 'Death certificate', note: 'Blurry' }), 'Document rejected', 'Death certificate — Blurry'],
    [entry('document.accepted', { label: 'CENOMAR' }), 'Document accepted', 'CENOMAR'],
    [entry('booking.rescheduled_by_staff', { fromDate: '2026-11-10', fromStart: '10:00', date: '2026-11-12', start: '14:00', reason: 'Family asked', leadTimeWaived: true }), 'Rescheduled by the office', '2026-11-10 10:00 → 2026-11-12 14:00. Family asked (lead time waived)'],
    [entry('booking.refunded', { reference: 'PM-1' }), 'Refund recorded', 'Reference PM-1'],
    [entry('booking.partial_refund', { reference: 'PM-2', amountCentavos: 5000 }), 'Partial refund recorded', '₱50.00 · reference PM-2'],
    [entry('booking.overpaid', { overpaidCentavos: 10000 }), 'Overpayment flagged', 'Overpaid by ₱100.00'],
    [entry('booking.payment_confirmed'), 'GCash payment confirmed', null],
    [entry('booking.cash_chosen', { from: 'unpaid' }), 'Chose to pay cash at the parish office', null],
    [entry('booking.cash_received', { amountCentavos: 500000, receiptReference: 'OR-0042' }), 'Cash received', '₱5,000.00 · receipt OR-0042'],
    [entry('booking.cash_received', { amountCentavos: 500000, receiptReference: null }), 'Cash received', '₱5,000.00'],
    [entry('register.recorded'), 'Added to the register', null],
    [entry('register.transcribed'), 'Copied from the paper book', null],
    [entry('register.corrected', { reason: 'Middle initial left out' }), 'Corrected', 'Middle initial left out'],
    [entry('register.paper_reference', { after: { bookNo: '4', pageNo: '12', lineNo: null } }), 'Paper reference changed', 'Book 4, page 12'],
    [entry('register.paper_reference', { after: { bookNo: null, pageNo: null, lineNo: null } }), 'Paper reference changed', 'Cleared'],
    [entry('register.revoked', { reason: 'Wrong person' }), 'Revoked', 'Wrong person'],
    [entry('register.reinstated', { reason: 'By mistake' }), 'Reinstated', 'By mistake'],
    [entry('milestone.ticked', { key: 'pre_cana', label: 'Pre-Cana seminar', note: 'Attended 3 Oct' }), 'Preparation step done', 'Pre-Cana seminar — Attended 3 Oct'],
    [entry('milestone.unticked', { key: 'pre_cana', label: 'Pre-Cana seminar', reason: 'license no longer valid for the new date' }), 'Preparation step undone', 'Pre-Cana seminar — license no longer valid for the new date'],
    [entry('milestone.ticked', { key: 'confession', label: 'Confession' }), 'Preparation step done', 'Confession'],
    [entry('document.attached_late', { label: 'Marriage license' }), 'Document added at the desk', 'Marriage license'],
    [entry('booking.checked_in'), 'Checked in', null],
    [entry('certificate.generated'), 'Certificate generated', null],
    [entry('something.new'), 'something.new', null],
  ])('%#', (e, title, detail) => {
    expect(describeHistory(e)).toEqual({ title, detail })
  })
})
