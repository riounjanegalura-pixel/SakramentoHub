import { describe, expect, it } from 'vitest'
import { journeyStages } from './journeyStages'
import type { AdminBooking as Booking } from '../../lib/types'
import { adminBooking } from '../../test/factories'

// The same fixture as the parishioner app's test, built on the admin booking shape.
function booking(overrides: Partial<Booking> = {}): Booking {
  return adminBooking({
    id: 'b1', referenceNumber: 'BAP-2026-0007', userId: 'u1', sacrament: 'baptism', status: 'submitted',
    statusLabel: 'Awaiting review', formData: {}, appointmentDate: '2030-01-08', appointmentStart: '10:00',
    appointmentEnd: '11:00', isEmergency: false, paymentStatus: 'unpaid', amountDueCentavos: 50000,
    paymentHoldExpiresAt: null, paidAt: null, paymentReference: null, refundReference: null, refundedAt: null,
    statusReason: null, returnNote: null, createdAt: '2026-11-02T00:00:00Z', ...overrides,
  })
}

const shape = (b: Booking) => journeyStages(b).stages.map((s) => `${s.key}:${s.state}:${s.label}`)
const FUTURE = new Date(Date.now() + 86_400_000).toISOString()
const PAST = '2020-01-01T00:00:00Z'

describe('journeyStages', () => {
  it('always lists the five stages in order unless the booking ended early', () => {
    expect(journeyStages(booking()).stages.map((s) => s.key)).toEqual(['requested', 'review', 'paid', 'confirmed', 'completed'])
  })

  it('a draft has only Requested as the current step, named as a draft', () => {
    expect(shape(booking({ status: 'draft', paymentStatus: null, amountDueCentavos: null }))).toEqual([
      'requested:current:Draft, not sent yet',
      'review:future:Under review',
      'paid:future:Paid',
      'confirmed:future:Confirmed',
      'completed:future:Completed',
    ])
  })

  it('a submitted booking with a fee due is under review, payment still to come', () => {
    expect(shape(booking({ paymentHoldExpiresAt: FUTURE }))).toEqual([
      'requested:done:Requested',
      'review:current:Under review',
      'paid:future:Payment due',
      'confirmed:future:Confirmed',
      'completed:future:Completed',
    ])
  })

  it('a booking waiting for cash is not Paid until the office records it', () => {
    expect(shape(booking({ paymentStatus: 'pending_cash', paymentHoldExpiresAt: FUTURE }))).toContain('paid:future:Cash due at the parish office')
    expect(shape(booking({ paymentStatus: 'pending_cash', paymentHoldExpiresAt: PAST }))).toContain('paid:future:Payment window ended')
  })

  it('a submitted booking already paid shows Paid done while review continues', () => {
    expect(shape(booking({ paymentStatus: 'paid' }))).toEqual([
      'requested:done:Requested',
      'review:current:Under review',
      'paid:done:Paid',
      'confirmed:future:Confirmed',
      'completed:future:Completed',
    ])
  })

  it('a booking with no fee shows Paid as "No payment needed" and done, never a step to do', () => {
    for (const b of [
      booking({ paymentStatus: 'not_required', amountDueCentavos: 0 }),
      booking({ paymentStatus: 'unpaid', amountDueCentavos: 0 }),
      booking({ paymentStatus: null, amountDueCentavos: null }),
    ]) {
      const paid = journeyStages(b).stages.find((s) => s.key === 'paid')!
      expect(paid).toMatchObject({ state: 'done', label: 'No payment needed' })
    }
  })

  it('a returned booking stays under review with a "Changes requested" note', () => {
    const review = journeyStages(booking({ status: 'returned', paymentStatus: 'not_required', amountDueCentavos: 0 })).stages.find((s) => s.key === 'review')!
    expect(review).toMatchObject({ state: 'current', note: 'Changes requested' })
  })

  it('an unpaid booking whose payment hold ran out says the payment window ended', () => {
    const paid = journeyStages(booking({ paymentHoldExpiresAt: PAST })).stages.find((s) => s.key === 'paid')!
    expect(paid).toMatchObject({ state: 'future', label: 'Payment window ended' })
  })

  it('an approved booking is confirmed as the current step', () => {
    expect(shape(booking({ status: 'approved', paymentStatus: 'paid' }))).toEqual([
      'requested:done:Requested',
      'review:done:Under review',
      'paid:done:Paid',
      'confirmed:current:Confirmed',
      'completed:future:Completed',
    ])
  })

  it('a completed booking has every stage done and no current step', () => {
    const j = journeyStages(booking({ status: 'completed', paymentStatus: 'not_required', amountDueCentavos: 0 }))
    expect(j.stages.every((s) => s.state === 'done')).toBe(true)
    expect(j.outcomes).toEqual([])
  })

  it('a declined booking stops after review with a danger "Declined" outcome', () => {
    const j = journeyStages(booking({ status: 'declined' }))
    expect(j.stages.map((s) => `${s.key}:${s.state}`)).toEqual(['requested:done', 'review:done'])
    expect(j.outcomes).toEqual([{ key: 'declined', label: 'Declined', tone: 'danger' }])
  })

  it('a cancelled booking stops at what it reached; a paid one keeps Paid and shows the refund row', () => {
    const unpaid = journeyStages(booking({ status: 'cancelled', paymentStatus: 'void' }))
    expect(unpaid.stages.map((s) => s.key)).toEqual(['requested'])
    expect(unpaid.outcomes).toEqual([{ key: 'cancelled', label: 'Cancelled', tone: 'danger' }])

    const due = journeyStages(booking({ status: 'cancelled', paymentStatus: 'refund_due' }))
    expect(due.stages.map((s) => `${s.key}:${s.state}`)).toEqual(['requested:done', 'paid:done'])
    expect(due.outcomes).toEqual([
      { key: 'cancelled', label: 'Cancelled', tone: 'danger' },
      { key: 'refund', label: 'Refund due', tone: 'neutral' },
    ])

    const refunded = journeyStages(booking({ status: 'declined', paymentStatus: 'refunded' }))
    expect(refunded.outcomes.at(-1)).toEqual({ key: 'refund', label: 'Refunded', tone: 'neutral' })
  })

  it('a late payment on a submitted booking (refund due) is not shown as paid', () => {
    const j = journeyStages(booking({ paymentStatus: 'refund_due', paymentHoldExpiresAt: PAST }))
    expect(j.stages.find((s) => s.key === 'paid')).toMatchObject({ state: 'future', label: 'Payment not applied, refund due' })
    expect(j.outcomes).toEqual([{ key: 'refund', label: 'Refund due', tone: 'neutral' }])
  })

  it('an approved booking with a refund due is not shown as paid', () => {
    const j = journeyStages(booking({ status: 'approved', paymentStatus: 'refund_due' }))
    expect(j.stages.find((s) => s.key === 'paid')).toMatchObject({ state: 'future', label: 'Payment not applied, refund due' })
    expect(j.stages.find((s) => s.key === 'confirmed')).toMatchObject({ state: 'current' })
    expect(j.outcomes).toEqual([{ key: 'refund', label: 'Refund due', tone: 'neutral' }])
  })

  it('a submitted booking whose payment was refunded says so, not paid', () => {
    const j = journeyStages(booking({ paymentStatus: 'refunded' }))
    expect(j.stages.find((s) => s.key === 'paid')).toMatchObject({ state: 'future', label: 'Payment refunded' })
    expect(j.outcomes).toEqual([{ key: 'refund', label: 'Refunded', tone: 'neutral' }])
  })

  it('a cancelled booking with a refund due keeps Paid, then Cancelled and Refund due (unchanged)', () => {
    const j = journeyStages(booking({ status: 'cancelled', paymentStatus: 'refund_due' }))
    expect(j.stages.map((s) => `${s.key}:${s.state}:${s.label}`)).toEqual(['requested:done:Requested', 'paid:done:Paid'])
    expect(j.outcomes.map((o) => o.label)).toEqual(['Cancelled', 'Refund due'])
  })

  it('a declined unpaid booking whose payment was voided has no Paid stage and only the Declined outcome', () => {
    const j = journeyStages(booking({ status: 'declined', paymentStatus: 'void' }))
    expect(j.stages.map((s) => s.key)).toEqual(['requested', 'review'])
    expect(j.outcomes).toEqual([{ key: 'declined', label: 'Declined', tone: 'danger' }])
  })

  it('every status and payment status gives one current stage, a terminal outcome, or a finished rail, and never throws', () => {
    const statuses = ['draft', 'submitted', 'returned', 'approved', 'completed', 'declined', 'cancelled'] as const
    const payments = ['not_required', 'unpaid', 'paid', 'refund_due', 'refunded', 'void'] as const
    for (const status of statuses) {
      for (const paymentStatus of payments) {
        for (const paymentHoldExpiresAt of [null, FUTURE, PAST]) {
          const j = journeyStages(booking({ status, paymentStatus, paymentHoldExpiresAt }))
          const current = j.stages.filter((s) => s.state === 'current').length
          const terminal = j.outcomes.some((o) => o.tone === 'danger')
          // A completed booking is the finished rail: every stage reached, nothing left current.
          const finished = status === 'completed' && current === 0 && j.stages.length === 5
          expect(current === 1 || terminal || finished, `${status} x ${paymentStatus}`).toBe(true)
          expect(current === 1 && terminal, `${status} x ${paymentStatus}`).toBe(false)
        }
      }
    }
  })

  it('never marks more than one stage as current', () => {
    for (const status of ['draft', 'submitted', 'returned', 'approved', 'completed', 'declined', 'cancelled'] as const) {
      expect(journeyStages(booking({ status })).stages.filter((s) => s.state === 'current').length).toBeLessThanOrEqual(1)
    }
  })
})
