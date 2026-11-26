import { describe, it, expect } from 'vitest'
import { peso, formatTime, formatDate, addDaysYmd, officeHoursText, parishToday, pastChangeCutoff, STATUS_LABEL, SACRAMENT_LABEL, holdLapsed, needsAction, PAYMENT_LABEL, EVENT_CATEGORY_LABEL, eventCategoryLabel } from './domain'

describe('holdLapsed', () => {
  const past = new Date(Date.now() - 3600_000).toISOString()
  const future = new Date(Date.now() + 3600_000).toISOString()
  const b = (over: Record<string, unknown>) => ({ status: 'submitted', paymentStatus: 'unpaid', paymentHoldExpiresAt: past, ...over }) as Parameters<typeof holdLapsed>[0]

  it('is true only for a submitted, unpaid booking whose hold has run out', () => {
    expect(holdLapsed(b({}))).toBe(true)
    expect(holdLapsed(b({ paymentHoldExpiresAt: future }))).toBe(false)
    expect(holdLapsed(b({ paymentStatus: 'paid' }))).toBe(false)
    expect(holdLapsed(b({ status: 'returned' }))).toBe(false)
  })

  it('treats a booking waiting for cash like an unpaid one', () => {
    expect(holdLapsed(b({ paymentStatus: 'pending_cash' }))).toBe(true)
    expect(holdLapsed(b({ paymentStatus: 'pending_cash', paymentHoldExpiresAt: future }))).toBe(false)
  })
})

describe('domain helpers', () => {
  it('formats pesos the way the parish writes them', () => {
    expect(peso(500000)).toBe('₱5,000.00')
    expect(peso(5000)).toBe('₱50.00')
  })

  it('formats times and dates without timezone drift', () => {
    expect(formatTime('14:30')).toBe('2:30 PM')
    expect(formatTime('08:00')).toBe('8:00 AM')
    expect(formatDate('2026-11-03')).toBe('Tue, Nov 3, 2026')
  })

  it('adds days to a YYYY-MM-DD string', () => {
    expect(addDaysYmd('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('uses parish wording', () => {
    expect(STATUS_LABEL.declined).toBe('Declined')
    expect(STATUS_LABEL.returned).toBe('Needs changes')
    expect(SACRAMENT_LABEL.funeral).toBe('Funeral Mass')
  })
})

describe('pastChangeCutoff', () => {
  const today = parishToday()
  it('is true for an approved booking closer than 3 days', () => {
    expect(pastChangeCutoff({ status: 'approved', appointmentDate: addDaysYmd(today, 2) })).toBe(true)
    expect(pastChangeCutoff({ status: 'approved', appointmentDate: today })).toBe(true)
  })
  it('is false exactly 3 days out, and for any other status', () => {
    expect(pastChangeCutoff({ status: 'approved', appointmentDate: addDaysYmd(today, 3) })).toBe(false)
    expect(pastChangeCutoff({ status: 'submitted', appointmentDate: addDaysYmd(today, 1) })).toBe(false)
    expect(pastChangeCutoff({ status: 'approved', appointmentDate: null })).toBe(false)
  })
})

describe('needsAction', () => {
  const b = (over: Record<string, unknown>) => ({ status: 'submitted', paymentStatus: 'unpaid', paymentHoldExpiresAt: null, ...over }) as Parameters<typeof needsAction>[0]
  it('asks for changes on a returned booking', () => {
    expect(needsAction(b({ status: 'returned' }))).toBe('The parish asked for changes')
  })
  it('asks for payment only while the hold is alive', () => {
    expect(needsAction(b({ paymentHoldExpiresAt: new Date(Date.now() + 3600_000).toISOString() }))).toBe('Pay with GCash to keep your slot')
    expect(needsAction(b({ paymentHoldExpiresAt: '2020-01-01T00:00:00Z' }))).toBeNull()
  })
  it('asks a booking waiting for cash to pay at the parish office while the hold is alive', () => {
    expect(needsAction(b({ paymentStatus: 'pending_cash', paymentHoldExpiresAt: new Date(Date.now() + 3600_000).toISOString() }))).toBe('Pay at the parish office to keep your slot')
    expect(needsAction(b({ paymentStatus: 'pending_cash', paymentHoldExpiresAt: '2020-01-01T00:00:00Z' }))).toBeNull()
  })
  it('labels the cash status in the parish wording', () => {
    expect(PAYMENT_LABEL.pending_cash).toBe('Cash at the parish office')
  })
  it('is null for a paid or approved booking', () => {
    expect(needsAction(b({ paymentStatus: 'paid' }))).toBeNull()
    expect(needsAction(b({ status: 'approved', paymentStatus: 'paid' }))).toBeNull()
  })
  it('asks the owner to pay an approved, unpaid booking, but not one still waiting for review', () => {
    expect(needsAction(b({ status: 'approved', paymentStatus: 'unpaid', canPayNow: true }))).toBe('Approved: pay to keep your slot')
    expect(needsAction(b({ status: 'submitted', paymentStatus: 'unpaid', canPayNow: false }))).toBeNull()
  })
})

describe('event category labels', () => {
  it('has a readable label for each parish event category', () => {
    expect(['mass', 'feast', 'seminar', 'fundraiser', 'community', 'notice', 'general'].map((c) => EVENT_CATEGORY_LABEL[c as keyof typeof EVENT_CATEGORY_LABEL])).toEqual([
      'Mass', 'Feast day', 'Seminar', 'Fundraiser', 'Community', 'Notice', 'Parish event',
    ])
  })
  it('shows an unknown category as-is', () => {
    expect(eventCategoryLabel('feast')).toBe('Feast day')
    expect(eventCategoryLabel('mystery')).toBe('mystery')
  })
})

describe('officeHoursText', () => {
  const base = { name: 'P', phone: '0', priestName: 'F', workingHours: { start: '08:00', end: '17:00' } }
  it('writes a run of days as a range', () => {
    expect(officeHoursText({ ...base, officeDays: [2, 3, 4, 5, 6] })).toBe('Tuesday to Saturday, 8:00 AM to 5:00 PM')
  })
  it('lists days that are not one run', () => {
    expect(officeHoursText({ ...base, officeDays: [1, 3, 5] })).toBe('Monday, Wednesday and Friday, 8:00 AM to 5:00 PM')
  })
  it('names a single day', () => {
    expect(officeHoursText({ ...base, officeDays: [6] })).toBe('Saturday, 8:00 AM to 5:00 PM')
  })
  it('gives the hours alone when the parish has no days on file', () => {
    expect(officeHoursText(base)).toBe('8:00 AM to 5:00 PM')
  })
})
