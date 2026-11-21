import { describe, it, expect, beforeEach } from 'vitest'
import { fetchAvailabilityDays, fetchDayAvailability, mockDayStatus } from './availability'
import { addDaysYmd, parishToday } from '../domain'
import { writeBookings } from './booking-storage'
import type { Booking } from '../types'

function held(over: Partial<Booking>): Booking {
  return {
    id: crypto.randomUUID(), referenceNumber: 'X', userId: 'u9', sacrament: 'funeral', status: 'submitted', statusLabel: '',
    formData: {}, appointmentDate: null, appointmentStart: '10:00', appointmentEnd: '11:00', isEmergency: false,
    paymentStatus: 'not_required', amountDueCentavos: 0, paymentHoldExpiresAt: null, paidAt: null, paymentReference: null,
    refundReference: null, refundedAt: null, statusReason: null, returnNote: null, createdAt: new Date().toISOString(), ...over,
  }
}

function nextSunday(): string {
  let d = addDaysYmd(parishToday(), 8)
  while (new Date(`${d}T00:00:00`).getDay() !== 0) d = addDaysYmd(d, 1)
  return d
}

function nextWeekdayDate(): string {
  let d = addDaysYmd(parishToday(), 3)
  while ([0, 1].includes(new Date(`${d}T00:00:00`).getDay())) d = addDaysYmd(d, 1)
  return d
}

describe('mockDayStatus', () => {
  beforeEach(() => localStorage.clear())

  it('marks past dates and lead-time dates unavailable with a reason', () => {
    expect(mockDayStatus('funeral', addDaysYmd(parishToday(), -1)).reason).toBe('That date has already passed.')
    expect(mockDayStatus('wedding', addDaysYmd(parishToday(), 1)).reason).toBe('Wedding must be booked at least 2 days ahead.')
  })

  it('offers only the Sunday session for a regular baptism', () => {
    let sunday = addDaysYmd(parishToday(), 8)
    while (new Date(`${sunday}T00:00:00`).getDay() !== 0) sunday = addDaysYmd(sunday, 1)
    expect(mockDayStatus('baptism', sunday, { scheduleType: 'regular' }).freeStarts).toEqual(['10:00'])
    expect(mockDayStatus('baptism', sunday, { scheduleType: 'special' }).status).toBe('unavailable')
  })

  it('marks a session day limited when the session is partly taken', () => {
    const sunday = nextSunday()
    writeBookings([held({ sacrament: 'baptism', appointmentDate: sunday, appointmentStart: '10:00', appointmentEnd: '11:00' })])
    const day = mockDayStatus('baptism', sunday, { scheduleType: 'regular' })
    expect(day.status).toBe('limited')
    expect(day.freeStarts).toEqual(['10:00'])
  })

  it('ignores an unpaid booking past its 48 hour hold but not one still inside it', () => {
    const date = nextWeekdayDate()
    const slot = { appointmentDate: date, appointmentStart: '10:00', appointmentEnd: '11:30', paymentStatus: 'unpaid' as const }
    writeBookings([held({ ...slot, paymentHoldExpiresAt: new Date(Date.now() - 1000).toISOString() })])
    expect(mockDayStatus('funeral', date).freeStarts).toContain('10:00')

    writeBookings([held({ ...slot, paymentHoldExpiresAt: new Date(Date.now() + 3600_000).toISOString() })])
    expect(mockDayStatus('funeral', date).freeStarts).not.toContain('10:00')
  })

  it("leaves the caller's own booking out when asked, so a returned booking can keep its slot", async () => {
    const date = nextWeekdayDate()
    const own = held({ status: 'returned', returnedAt: new Date().toISOString(), appointmentDate: date, appointmentStart: '10:00', appointmentEnd: '11:30' })
    writeBookings([own])

    expect((await fetchDayAvailability('funeral', date)).freeStarts).not.toContain('10:00')
    expect((await fetchDayAvailability('funeral', date, {}, own.id)).freeStarts).toContain('10:00')

    const count = async (exclude?: string) => (await fetchAvailabilityDays('funeral', date, date, {}, exclude))[0].freeCount
    expect(await count(own.id)).toBeGreaterThan(await count())
  })

  it('ignores a returned booking older than 7 days', () => {
    const date = nextWeekdayDate()
    const slot = { status: 'returned' as const, appointmentDate: date, appointmentStart: '10:00', appointmentEnd: '11:00' }
    writeBookings([held({ ...slot, returnedAt: new Date(Date.now() - 8 * 86400_000).toISOString() })])
    expect(mockDayStatus('funeral', date).freeStarts).toContain('10:00')

    writeBookings([held({ ...slot, returnedAt: new Date(Date.now() - 86400_000).toISOString() })])
    expect(mockDayStatus('funeral', date).freeStarts).not.toContain('10:00')
  })
})
