import { describe, expect, it } from 'vitest'
import type { ScheduleBookingItem, ScheduleDay } from '../../lib/types'
import { buildDay, dueWhen, findingText, minutesLong, minutesShort, parishNowMinutes, ribbonPct, untilIso, waitedFor, weekdayLetter } from './dashboardModel'

const visit = (o: Partial<ScheduleBookingItem>): ScheduleBookingItem => ({
  type: 'booking', id: 'b', referenceNumber: 'R', sacrament: 'baptism', subjectName: 'Ana Lim', start: '09:00', end: '10:00', status: 'approved',
  paymentStatus: null, isOffsite: false, channel: 'online', inSession: false, checkedInAt: null, contactName: null, contactRelationship: null, contactPhone: null, location: null, ...o,
})
const day = (items: ScheduleDay['items']): ScheduleDay => ({ date: '2026-11-03', blackouts: [], items })

describe('dashboardModel', () => {
  it('places times on the 6 AM to 6 PM ribbon and keeps them inside it', () => {
    expect(ribbonPct('06:00')).toBe(0)
    expect(ribbonPct('12:00')).toBe(50)
    expect(ribbonPct('18:00')).toBe(100)
    expect(ribbonPct('05:00')).toBe(0)
    expect(ribbonPct('20:00')).toBe(100)
  })

  it('reads the parish clock, not the machine clock', () => {
    expect(parishNowMinutes(new Date('2026-11-03T01:15:00Z'))).toBe(9 * 60 + 15)
  })

  it('words minutes both ways', () => {
    expect(minutesLong(45)).toBe('45 minutes')
    expect(minutesLong(90)).toBe('1 hour 30 minutes')
    expect(minutesShort(45)).toBe('45 min')
    expect(minutesShort(120)).toBe('2 h')
  })

  it('marks the first unfinished visit today as next and the arrived one as done', () => {
    const m = buildDay(day([visit({ id: 'a', start: '08:00', end: '09:00', checkedInAt: '2026-11-03T00:00:00Z' }), visit({ id: 'b', start: '10:00', end: '11:00' }), visit({ id: 'c', start: '15:00', end: '16:00' })]), 30, true, 9 * 60 + 15)
    expect(m.visits.map((v) => v.state)).toEqual(['done', 'next', 'later'])
    expect(m.next?.item.id).toBe('b')
    expect(m.visits[1].pill?.text).toBe('Next · in 45 min')
  })

  it('has no next visit on another day, and says when a returned booking needs changes', () => {
    const m = buildDay(day([visit({ status: 'returned' })]), 30, false, 0)
    expect(m.next).toBeNull()
    expect(m.visits[0].pill).toEqual({ text: 'Needs changes', tone: 'pending' })
  })

  it('says when to leave for an off-site visit', () => {
    const m = buildDay(day([visit({ sacrament: 'funeral', isOffsite: true, start: '10:00', end: '11:30' })]), 30, false, 0)
    expect(m.visits[0].sub).toBe('Funeral Mass, off-site · leave by 9:30 AM')
    expect(m.travel).toHaveLength(2)
  })

  it('words the finding for a busy day, a finished day and a quiet one', () => {
    const base = { isToday: true, todayVisits: 0, next: null, nowMin: 0, waiting: 0, holds: [], holdCount: 0, now: new Date('2026-11-03T01:15:00Z') }
    expect(findingText(base)).toBe('Nothing is waiting and there are no visits today.')
    expect(findingText({ ...base, waiting: 3 })).toBe('3 items are waiting for you. No visits today.')
    expect(findingText({ ...base, todayVisits: 2, holdCount: 2 })).toBe('2 visits today, none left to come. 2 payment holds end within 12 hours.')
  })

  it('counts time until a hold ends and how long a request has waited', () => {
    const now = new Date('2026-11-03T01:15:00Z')
    expect(untilIso('2026-11-03T03:15:00Z', now)).toBe('2 hours')
    expect(untilIso('2026-11-03T01:45:00Z', now)).toBe('30 minutes')
    expect(waitedFor('2026-11-01T01:00:00Z', now)).toBe('waiting 2 days')
    expect(waitedFor('2026-11-03T00:00:00Z', now)).toBe('waiting since today')
  })

  it('dates a due visit as Today, Tomorrow, then the weekday and date', () => {
    expect(dueWhen('2026-11-03', '2026-11-03')).toBe('Today')
    expect(dueWhen('2026-11-04', '2026-11-03')).toBe('Tomorrow')
    expect(dueWhen('2026-11-05', '2026-11-03')).toBe('Thu, Nov 5')
    expect(weekdayLetter('2026-11-03')).toBe('T')
  })
})
