import { describe, expect, it } from 'vitest'
import { buildCalendarItems, nextForYou } from './calendarItems'
import type { Booking } from '../../lib/types'

const b = (over: Partial<Booking>): Booking =>
  ({ id: 'x', referenceNumber: 'BK-1', userId: 'u1', sacrament: 'baptism', status: 'submitted', statusLabel: '', formData: {}, appointmentDate: null, appointmentStart: null, appointmentEnd: null, isEmergency: false, paymentStatus: null, amountDueCentavos: null, ...over }) as Booking

describe('buildCalendarItems', () => {
  it('lists parish events and only the held bookings that have a date', () => {
    const items = buildCalendarItems(
      [{ id: 'e1', title: 'Sunday Mass', date: '2026-11-08T08:00:00' } as never],
      [b({ id: 'b1', status: 'approved', appointmentDate: '2026-11-10', appointmentStart: '09:00' }), b({ id: 'b2', status: 'draft', appointmentDate: '2026-11-11' }), b({ id: 'b3', status: 'cancelled', appointmentDate: '2026-11-12' }), b({ id: 'b4', status: 'approved', appointmentDate: null })],
    )
    expect(items.map((i) => i.id)).toEqual(['e1', 'b1'])
    expect(items[1]).toMatchObject({ title: 'Baptism — Your Booking', isOwnBooking: true })
    expect(items[1].date.getHours()).toBe(9)
  })
  it('copes with nothing loaded yet', () => {
    expect(buildCalendarItems(undefined, undefined)).toEqual([])
  })
})

describe('nextForYou', () => {
  const today = '2026-11-02'
  it('picks the earliest held booking on or after today', () => {
    const r = nextForYou([
      b({ id: 'late', status: 'approved', appointmentDate: '2026-11-20', appointmentStart: '09:00' }),
      b({ id: 'soon', status: 'submitted', appointmentDate: '2026-11-03', appointmentStart: '15:00' }),
      b({ id: 'same', status: 'approved', appointmentDate: '2026-11-03', appointmentStart: '10:00' }),
      b({ id: 'past', status: 'approved', appointmentDate: '2026-10-30', appointmentStart: '10:00' }),
    ], today)
    expect(r.next?.id).toBe('same')
  })
  it('ignores drafts, declined and cancelled bookings', () => {
    const r = nextForYou([b({ status: 'draft', appointmentDate: '2026-11-03' }), b({ status: 'declined', appointmentDate: '2026-11-03' }), b({ status: 'cancelled', appointmentDate: '2026-11-03' })], today)
    expect(r.next).toBeNull()
  })
  it('flags a returned booking and a submitted one still waiting for payment, not a paid one', () => {
    const r = nextForYou([
      b({ id: 'ret', status: 'returned' }),
      b({ id: 'pay', status: 'submitted', paymentStatus: 'unpaid' }),
      b({ id: 'ok', status: 'approved', paymentStatus: 'paid' }),
      b({ id: 'sub', status: 'submitted', paymentStatus: 'paid' }),
    ], today)
    expect(r.needsAction.map((x) => x.id)).toEqual(['ret', 'pay'])
  })
  it('does not flag a submitted unpaid booking whose payment hold has lapsed, but does flag one with a future hold', () => {
    const future = new Date(Date.now() + 3600_000).toISOString()
    const r = nextForYou([
      b({ id: 'lapsed', status: 'submitted', paymentStatus: 'unpaid', paymentHoldExpiresAt: '2020-01-01T00:00:00Z' }),
      b({ id: 'held', status: 'submitted', paymentStatus: 'unpaid', paymentHoldExpiresAt: future }),
      b({ id: 'ret', status: 'returned' }),
    ], today)
    expect(r.needsAction.map((x) => x.id)).toEqual(['held', 'ret'])
  })
  it('is empty for no bookings', () => {
    expect(nextForYou([], today)).toEqual({ next: null, needsAction: [] })
  })
})
