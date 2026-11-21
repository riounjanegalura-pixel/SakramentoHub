import { describe, expect, it } from 'vitest'
import { approvalChecks, docMeta, docState, firstName, holdLeft, leftText, nextStep, paymentCell, unreviewedDocs, viewKeyFor, whenText } from './bookingModel'
import { adminBooking, bookingDocument } from '../../test/factories'

const NOW = Date.parse('2026-11-03T08:00:00Z')
const reviewed = (status: 'accepted' | 'rejected') => ({ status, note: status === 'rejected' ? 'Blurry' : null, reviewedBy: 'S', reviewedAt: '2026-11-02T00:00:00Z' })

describe('viewKeyFor', () => {
  it('names the four views and none for any other mix', () => {
    expect(viewKeyFor([])).toBe('all')
    expect(viewKeyFor(['submitted'])).toBe('waiting')
    expect(viewKeyFor(['approved'])).toBe('upcoming')
    expect(viewKeyFor(['completed'])).toBe('completed')
    expect(viewKeyFor(['declined'])).toBeNull()
    expect(viewKeyFor(['submitted', 'approved'])).toBeNull()
  })
})

describe('whenText', () => {
  it('words a dated booking, an urgent one and an undated one', () => {
    expect(whenText(adminBooking({ appointmentDate: '2026-12-14', appointmentStart: '10:00' }))).toBe('Dec 14, 10:00 AM')
    expect(whenText(adminBooking({ isEmergency: true }))).toBe('No time: urgent')
    expect(whenText(adminBooking())).toBe('No time yet')
  })
})

describe('paymentCell', () => {
  it.each([
    ['paid', 'Paid', 'ok'],
    ['unpaid', 'Unpaid', 'warn'],
    ['pending_cash', 'Cash due', 'warn'],
    ['refund_due', 'Refund due', 'bad'],
    ['refunded', 'Refunded', 'mute'],
    ['void', 'Void', 'mute'],
    ['not_required', 'No fee', 'mute'],
    [null, 'No fee', 'mute'],
  ] as const)('%s is "%s"', (paymentStatus, label, tone) => {
    expect(paymentCell({ paymentStatus })).toEqual({ label, tone })
  })
})

describe('firstName and holdLeft', () => {
  it('takes the first word, with a fallback', () => {
    expect(firstName('Carla Mendoza')).toBe('Carla')
    expect(firstName(null)).toBe('the parishioner')
  })

  it('counts the hold in minutes, hours or days, and is null once over', () => {
    const at = (min: number) => ({ paymentHoldExpiresAt: new Date(NOW + min * 60000).toISOString() })
    expect(holdLeft(at(1), NOW)).toBe('in 1 minute')
    expect(holdLeft(at(25), NOW)).toBe('in 25 minutes')
    expect(holdLeft(at(120), NOW)).toBe('in 2 hours')
    expect(holdLeft(at(60 * 24 * 4), NOW)).toBe('in 4 days')
    expect(holdLeft(at(-5), NOW)).toBeNull()
    expect(holdLeft({ paymentHoldExpiresAt: null }, NOW)).toBeNull()
  })
})

describe('nextStep', () => {
  const step = (o: Parameters<typeof adminBooking>[0]) => nextStep(adminBooking(o), NOW, '2026-11-03')
  const hold = new Date(NOW + 2 * 3600_000).toISOString()

  it('puts a refund first, whatever else is true', () => {
    expect(step({ status: 'cancelled', paymentStatus: 'refund_due', amountPaidCentavos: 50000, amountRefundedCentavos: 0 })).toBe('Record the ₱500.00 refund')
  })

  it('words a submitted booking by what blocks it, most urgent first', () => {
    expect(step({ isEmergency: true })).toBe('Call the family now, then review')
    expect(step({ paymentStatus: 'unpaid', paymentHoldExpiresAt: hold })).toBe('Take payment. Hold ends in 2 hours')
    expect(step({ paymentStatus: 'unpaid', paymentHoldExpiresAt: new Date(NOW - 1000).toISOString() })).toBe('Payment window ended')
    expect(step({ paymentStatus: 'paid', documents: [bookingDocument({ key: 'a' }), bookingDocument({ key: 'b' })] })).toBe('Review 2 documents')
    expect(step({ paymentStatus: 'paid', documents: [bookingDocument({ key: 'a' })] })).toBe('Review 1 document')
    expect(step({ paymentStatus: 'paid', documents: [bookingDocument({ review: reviewed('rejected') })] })).toBe('Send back for the rejected document')
    expect(step({ paymentStatus: 'paid', documents: [bookingDocument({ review: reviewed('accepted') })] })).toBe('Approve or send back')
  })

  it('waits for the parishioner, or the desk, on a returned booking', () => {
    expect(step({ status: 'returned', user: { fullName: 'Jun Reyes', email: null, phone: null } })).toBe('Waiting for Jun to send changes')
    expect(step({ status: 'returned', channel: 'walk_in' })).toBe('Waiting for changes at the office desk')
  })

  it('walks an approved booking from the day before to the ceremony', () => {
    expect(step({ status: 'approved', appointmentDate: '2026-12-14' })).toBe('Ready for the appointment day')
    expect(step({ status: 'approved', appointmentDate: '2026-11-03' })).toBe('Check in, then mark completed')
    expect(step({ status: 'approved', appointmentDate: '2026-11-03', checkedInAt: '2026-11-03T01:00:00Z' })).toBe('Mark completed after the ceremony')
  })

  it('has nothing left for closed bookings and says a draft is not sent', () => {
    for (const status of ['completed', 'declined', 'cancelled'] as const) expect(step({ status })).toBe('Nothing left to do')
    expect(step({ status: 'draft' })).toBe('Not sent yet')
  })
})

describe('nextStep with approval first', () => {
  it('sends a submitted, unpaid booking to review, and an approved one to the parishioner to pay', () => {
    expect(nextStep(adminBooking({ status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 5000, paymentAfterApproval: true, paymentHoldExpiresAt: null }))).toBe('Approve or send back')
    expect(nextStep(adminBooking({ status: 'approved', paymentStatus: 'unpaid', amountDueCentavos: 5000, paymentAfterApproval: true, paymentHoldExpiresAt: null }))).toMatch(/^Waiting for .+ to pay/)
  })
})

describe('approvalChecks', () => {
  it('does not hold Approve back for an unpaid fee when approval comes first', () => {
    const a = approvalChecks(adminBooking({ paymentStatus: 'unpaid', amountDueCentavos: 5000, paymentAfterApproval: true, paymentHoldExpiresAt: null }))
    expect(a.checks.find((c) => c.key === 'payment')).toMatchObject({ ok: true, text: 'Payment comes after approval' })
    expect(a.left).toBe(0)
  })
  it('still holds Approve back for an unpaid fee in the older order', () => {
    const a = approvalChecks(adminBooking({ paymentStatus: 'unpaid', amountDueCentavos: 5000, paymentAfterApproval: false }))
    expect(a.checks.find((c) => c.key === 'payment')?.ok).toBe(false)
  })
  it('has every item done for a paid booking with every file accepted and a held time', () => {
    const a = approvalChecks(adminBooking({ paymentStatus: 'paid', amountDueCentavos: 5000, appointmentDate: '2030-01-08', documents: [bookingDocument({ review: reviewed('accepted') })] }))
    expect(a.checks.map((c) => [c.key, c.ok])).toEqual([['payment', true], ['documents', true], ['time', true]])
    expect(a.left).toBe(0)
  })

  it('names what is open in words, with the action that closes it', () => {
    const a = approvalChecks(adminBooking({ paymentStatus: 'unpaid', amountDueCentavos: 5000, documents: [bookingDocument({ key: 'a' }), bookingDocument({ key: 'b', review: reviewed('accepted') })] }))
    expect(a.left).toBe(2)
    expect(a.checks[0]).toMatchObject({ text: 'Take the payment', action: { kind: 'payment' } })
    expect(a.checks[1]).toMatchObject({ text: 'Review every uploaded document', sub: '1 of 2 accepted', action: { kind: 'documents' } })
  })

  it('treats a rejected file as still open', () => {
    expect(approvalChecks(adminBooking({ paymentStatus: 'not_required', documents: [bookingDocument({ review: reviewed('rejected') })] })).left).toBe(1)
  })

  it('says a lapsed payment window released the time', () => {
    const a = approvalChecks(adminBooking({ status: 'submitted', paymentStatus: 'unpaid', appointmentDate: '2030-01-08', paymentHoldExpiresAt: new Date(Date.now() - 1000).toISOString() }))
    expect(a.checks.find((c) => c.key === 'time')).toMatchObject({ ok: false, text: 'The time is no longer held' })
  })

  it('leaves out the time for an urgent request, and the documents when none were uploaded', () => {
    const a = approvalChecks(adminBooking({ isEmergency: true, appointmentDate: null, paymentStatus: 'not_required', documents: [bookingDocument({ url: null })] }))
    expect(a.checks.map((c) => c.key)).toEqual(['payment'])
  })

  it('counts in the singular and the plural', () => {
    expect(leftText(1)).toBe('1 thing left before you can approve.')
    expect(leftText(2)).toBe('2 things left before you can approve.')
  })
})

describe('documents', () => {
  it('words a document\'s state and meta line', () => {
    expect(docState(bookingDocument({ url: null }))).toMatchObject({ label: 'Not uploaded', tone: 'neutral' })
    expect(docState(bookingDocument())).toMatchObject({ label: 'Not reviewed', tone: 'pending' })
    expect(docState(bookingDocument({ review: reviewed('accepted') }))).toMatchObject({ label: 'Accepted', tone: 'done' })
    expect(docState(bookingDocument({ review: reviewed('rejected') }))).toMatchObject({ label: 'Rejected', tone: 'rejected' })
    expect(docMeta(bookingDocument({ url: '/documents/u1/a.jpeg', required: false }))).toBe('JPG · Optional')
    expect(docMeta(bookingDocument({ url: null, required: false }))).toBe('Optional, can be added later')
    expect(docMeta(bookingDocument({ url: null, required: true }))).toBe('Required')
  })

  it('finds the files nobody has reviewed', () => {
    expect(unreviewedDocs({ documents: [bookingDocument({ key: 'a' }), bookingDocument({ key: 'b', url: null }), bookingDocument({ key: 'c', review: reviewed('accepted') })] }).map((d) => d.key)).toEqual(['a'])
  })
})
