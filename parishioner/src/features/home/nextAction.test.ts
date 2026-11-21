import { describe, expect, it } from 'vitest'
import { nextAction } from './nextAction'
import type { Booking } from '../../lib/types'

const b = (over: Partial<Booking>): Booking =>
  ({ id: 'x', referenceNumber: 'BK-1', userId: 'u1', sacrament: 'wedding', status: 'approved', statusLabel: '', formData: {}, appointmentDate: null, appointmentStart: null, appointmentEnd: null, isEmergency: false, paymentStatus: null, amountDueCentavos: null, paymentHoldExpiresAt: null, ...over }) as Booking

const TODAY = '2026-11-05'
const FUTURE = '2099-01-01T09:00:00Z'

describe('nextAction', () => {
  it('asks for payment first, with the deadline and the amount', () => {
    const r = nextAction(
      [
        b({ id: 'up', status: 'approved', appointmentDate: '2026-11-08', appointmentStart: '10:00' }),
        b({ id: 'ret', status: 'returned' }),
        b({ id: 'pay', status: 'submitted', paymentStatus: 'unpaid', paymentHoldExpiresAt: FUTURE, amountDueCentavos: 150000 }),
      ],
      TODAY,
    )
    expect(r).toMatchObject({ kind: 'pay', booking: { id: 'pay' }, deadline: FUTURE, amountCentavos: 150000, cta: 'Review and pay' })
  })

  it('puts the payment that runs out first ahead of the others', () => {
    const r = nextAction(
      [
        b({ id: 'late', status: 'submitted', paymentStatus: 'unpaid', paymentHoldExpiresAt: '2099-02-01T00:00:00Z' }),
        b({ id: 'soon', status: 'submitted', paymentStatus: 'unpaid', paymentHoldExpiresAt: '2099-01-01T00:00:00Z' }),
      ],
      TODAY,
    )
    expect(r).toMatchObject({ kind: 'pay', booking: { id: 'soon' } })
  })

  it('asks for the changes the parish returned when nothing is due', () => {
    const r = nextAction([b({ id: 'ret', status: 'returned', returnNote: 'Upload the baptismal certificate' })], TODAY)
    expect(r).toMatchObject({ kind: 'returned', booking: { id: 'ret' }, note: 'Upload the baptismal certificate', cta: 'Review changes' })
  })

  it('shows the next appointment when nothing needs the parishioner', () => {
    const r = nextAction(
      [b({ id: 'b', appointmentDate: '2026-11-20', appointmentStart: '09:00' }), b({ id: 'a', appointmentDate: '2026-11-08', appointmentStart: '10:00' })],
      TODAY,
    )
    expect(r).toMatchObject({ kind: 'upcoming', booking: { id: 'a' }, cta: 'View booking' })
  })

  it('says nothing is needed when there is nothing to do', () => {
    expect(nextAction([b({ status: 'completed', appointmentDate: '2026-01-01' })], TODAY)).toEqual({ kind: 'none' })
    expect(nextAction([], TODAY)).toEqual({ kind: 'none' })
  })

  const PAST = '2020-01-01T00:00:00Z'
  const lapsed = (over: Partial<Booking> = {}) =>
    b({ id: 'lapsed', status: 'submitted', paymentStatus: 'unpaid', paymentHoldExpiresAt: PAST, appointmentDate: '2026-11-10', appointmentStart: '09:00', ...over })

  it('never reports a lapsed payment hold as an upcoming appointment', () => {
    const r = nextAction([lapsed()], TODAY)
    expect(r).toMatchObject({ kind: 'lapsed', booking: { id: 'lapsed' }, cta: 'View booking' })
  })

  it('lets a valid upcoming booking win over a lapsed hold', () => {
    const r = nextAction([lapsed(), b({ id: 'ok', appointmentDate: '2026-11-20', appointmentStart: '09:00' })], TODAY)
    expect(r).toMatchObject({ kind: 'upcoming', booking: { id: 'ok' } })
  })

  it('still asks for another booking payment when one hold has lapsed', () => {
    const r = nextAction([lapsed(), b({ id: 'pay', status: 'submitted', paymentStatus: 'unpaid', paymentHoldExpiresAt: FUTURE })], TODAY)
    expect(r).toMatchObject({ kind: 'pay', booking: { id: 'pay' } })
  })

  it('lets a paid booking win over a lapsed hold', () => {
    const r = nextAction([lapsed(), b({ id: 'paid', status: 'submitted', paymentStatus: 'paid', appointmentDate: '2026-11-25', appointmentStart: '09:00' })], TODAY)
    expect(r).toMatchObject({ kind: 'upcoming', booking: { id: 'paid' } })
  })
})
