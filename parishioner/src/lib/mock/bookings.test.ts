import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { saveDraft, updateDraft, submitBooking, cancelBooking, fetchBookings, initiatePayment, rescheduleBooking } from './bookings'
import { seedBooking } from '../../test/seed'
import { mockDayStatus } from './availability'
import type { Booking } from '../types'
import { addDaysYmd, parishToday } from '../domain'

/** Next date on/after `from` whose ISO weekday is in `days`. */
function nextWeekday(from: string, days: number[]): string {
  let d = from
  for (let i = 0; i < 14; i++) {
    const js = new Date(`${d}T00:00:00`).getDay()
    if (days.includes(js === 0 ? 7 : js)) return d
    d = addDaysYmd(d, 1)
  }
  throw new Error('no weekday found')
}

describe('bookings mock (new contract)', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('sakramentohub_mock_current_user', JSON.stringify({ id: 'u1', emailVerifiedAt: '2026-01-01T00:00:00Z' }))
  })
  afterEach(() => vi.useRealTimers())

  it('upserts one draft per user and sacrament, with the appointment outside formData', async () => {
    const a = await saveDraft({ userId: 'u1', sacrament: 'funeral', formData: { massType: 'church' }, appointmentDate: '2030-01-08', appointmentStart: '10:00' })
    const b = await saveDraft({ userId: 'u1', sacrament: 'funeral', formData: { massType: 'house' }, appointmentDate: '2030-01-08', appointmentStart: '11:00' })
    expect(b.id).toBe(a.id)
    expect(b.appointmentStart).toBe('11:00')
    expect(b.formData).toEqual({ massType: 'house' })
    expect(await fetchBookings('u1')).toHaveLength(1)
  })

  it('quotes the baptism fee per sponsor on the draft', async () => {
    const d = await saveDraft({ userId: 'u1', sacrament: 'baptism', formData: { sponsors: [{}, {}, {}] } })
    expect(d.amountDueCentavos).toBe(15000)
  })

  it('submits a free booking at a free time and computes its end', async () => {
    const date = nextWeekday(addDaysYmd(parishToday(), 2), [2, 3, 4, 5, 6])
    const d = await saveDraft({ userId: 'u1', sacrament: 'funeral', formData: { massType: 'church' }, appointmentDate: date, appointmentStart: '10:00' })
    const s = await submitBooking(d.id)
    expect(s.status).toBe('submitted')
    expect(s.paymentStatus).toBe('not_required')
    expect(s.appointmentEnd).toBe('11:00')
  })

  it('refuses a time the priest already has', async () => {
    const date = nextWeekday(addDaysYmd(parishToday(), 2), [2, 3, 4, 5, 6])
    const first = await saveDraft({ userId: 'u1', sacrament: 'funeral', formData: { massType: 'church' }, appointmentDate: date, appointmentStart: '10:00' })
    await submitBooking(first.id)
    const second = await saveDraft({ userId: 'u2', sacrament: 'anointing', formData: { inDangerOfDeath: false }, appointmentDate: date, appointmentStart: '10:00' })
    await expect(submitBooking(second.id)).rejects.toThrow('That time is no longer available. Please choose another.')
  })

  it('submits an emergency anointing without a slot', async () => {
    const d = await saveDraft({ userId: 'u1', sacrament: 'anointing', formData: { inDangerOfDeath: true } })
    const s = await submitBooking(d.id)
    expect(s.isEmergency).toBe(true)
    expect(s.appointmentDate).toBeNull()
  })

  it('only edits drafts and returned bookings', async () => {
    const d = await saveDraft({ userId: 'u1', sacrament: 'anointing', formData: { inDangerOfDeath: true } })
    await submitBooking(d.id)
    await expect(updateDraft(d.id, { formData: {} })).rejects.toThrow('Only a draft or a returned booking can be edited.')
  })

  it('voids an unpaid booking on cancel and pays a priced one through the mock checkout', async () => {
    const date = nextWeekday(addDaysYmd(parishToday(), 95), [2, 3, 4, 5, 6])
    const d = await saveDraft({ userId: 'u1', sacrament: 'wedding', formData: {}, appointmentDate: date, appointmentStart: '10:00' })
    const s = await submitBooking(d.id)
    expect(s.paymentStatus).toBe('unpaid')
    await initiatePayment(s.id)
    const paidCancelled = await cancelBooking(s.id, 'Changed plans')
    expect(paidCancelled.paymentStatus).toBe('refund_due')
    expect(paidCancelled.statusReason).toBe('Changed plans')
  })

  it('blocks submit until the email is verified', async () => {
    localStorage.setItem('sakramentohub_mock_current_user', JSON.stringify({ id: 'u1', emailVerifiedAt: null }))
    const d = await saveDraft({ userId: 'u1', sacrament: 'anointing', formData: { inDangerOfDeath: true } })
    await expect(submitBooking(d.id)).rejects.toThrow('Please verify your email address')
  })
})

describe('bookings mock: parity with the server rules for returned and approved bookings', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('sakramentohub_mock_current_user', JSON.stringify({ id: 'u1', emailVerifiedAt: '2026-01-01T00:00:00Z' }))
  })

  // Baptism has a 7-day lead time; a Tuesday–Saturday inside that window breaks it.
  const soon = () => nextWeekday(addDaysYmd(parishToday(), 1), [2, 3, 4, 5, 6])
  const returned = (over: Partial<Booking> = {}) => {
    const date = soon()
    return seedBooking({
      userId: 'u1', sacrament: 'baptism', status: 'returned', formData: { scheduleType: 'special' },
      appointmentDate: date, appointmentStart: '10:00', returnedAt: new Date().toISOString(),
      returnedSlot: { date, start: '10:00' }, ...over,
    })
  }

  it('resubmits a returned booking on the slot it still holds, inside the lead time', async () => {
    const b = returned()
    expect(b.appointmentDate! < addDaysYmd(parishToday(), 7)).toBe(true)
    const submitted = await submitBooking(b.id)
    expect(submitted.status).toBe('submitted')
  })

  it('shows the held slot as bookable to its own booking, but not to anyone else', () => {
    const b = returned()
    expect(mockDayStatus('baptism', b.appointmentDate!, { scheduleType: 'special' }, b.id).freeStarts).toContain('10:00')
    expect(mockDayStatus('baptism', b.appointmentDate!, { scheduleType: 'special' }).status).toBe('unavailable')
  })

  it('applies the lead time when a returned booking moves to a different start', async () => {
    const b = returned({ appointmentStart: '11:00' }) // held 10:00, now asking for 11:00
    await expect(submitBooking(b.id)).rejects.toThrow(/must be booked at least 7 days ahead/i)
  })

  it('applies the lead time once the 7-day hold has lapsed', async () => {
    const b = returned({ returnedAt: new Date(Date.now() - 8 * 86400_000).toISOString() })
    await expect(submitBooking(b.id)).rejects.toThrow(/must be booked at least 7 days ahead/i)
  })

  it('remembers the slot a returned booking held when its answers are edited', async () => {
    const b = returned({ returnedSlot: undefined })
    const edited = await updateDraft(b.id, { appointmentStart: '11:00' })
    expect(edited.returnedSlot).toEqual({ date: b.appointmentDate, start: '10:00' })
  })

  it('refuses to reschedule an approved booking closer than 3 days, with the server wording', async () => {
    const b = seedBooking({ userId: 'u1', sacrament: 'house-blessing', status: 'approved', appointmentDate: addDaysYmd(parishToday(), 2), appointmentStart: '10:00', appointmentEnd: '10:45' })
    const target = nextWeekday(addDaysYmd(parishToday(), 10), [2, 3, 4, 5, 6])
    await expect(rescheduleBooking(b.id, target, '10:00')).rejects.toThrow(
      'Approved bookings can only be rescheduled online until 3 days before the appointment. Please call the parish office at 09123456789.',
    )
  })

  it('reschedules an approved booking exactly 3 days out', async () => {
    const b = seedBooking({ userId: 'u1', sacrament: 'house-blessing', status: 'approved', appointmentDate: addDaysYmd(parishToday(), 3), appointmentStart: '10:00', appointmentEnd: '10:45' })
    const target = nextWeekday(addDaysYmd(parishToday(), 10), [2, 3, 4, 5, 6])
    const moved = await rescheduleBooking(b.id, target, '10:00')
    expect(moved.appointmentDate).toBe(target)
  })
})
