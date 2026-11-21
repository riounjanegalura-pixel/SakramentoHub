import { describe, expect, it } from 'vitest'
import { buildAgenda, toHHMM, toMinutes } from './agenda'
import type { ScheduleItem } from '../../lib/types'

const mass: ScheduleItem = { type: 'mass', title: 'Sunday Mass', start: '08:00', end: '09:00' }
const blessing: ScheduleItem = {
  type: 'booking', id: 'b1', referenceNumber: 'HOUS-1', sacrament: 'house-blessing', subjectName: 'Nena Store',
  start: '10:00', end: '10:45', status: 'approved', paymentStatus: 'not_required', isOffsite: true, channel: 'online', inSession: false, checkedInAt: null,
  contactName: null, contactRelationship: null, contactPhone: null, location: null,
}
const funeral: ScheduleItem = { ...blessing, id: 'b2', sacrament: 'funeral', start: '13:00', end: '14:00', isOffsite: false }

describe('agenda', () => {
  it('converts between HH:MM and minutes', () => {
    expect(toMinutes('09:30')).toBe(570)
    expect(toHHMM(570)).toBe('09:30')
    expect(toHHMM(0)).toBe('00:00')
  })

  it('draws travel around off-site bookings only, in time order', () => {
    const entries = buildAgenda([funeral, blessing, mass], 30)
    expect(entries.map((e) => [e.kind, e.start, e.end])).toEqual([
      ['item', '08:00', '09:00'],
      ['travel', '09:30', '10:00'],
      ['item', '10:00', '10:45'],
      ['travel', '10:45', '11:15'],
      ['item', '13:00', '14:00'],
    ])
    expect(entries[1]).toMatchObject({ kind: 'travel', side: 'before', minutes: 30, forId: 'b1' })
    expect(entries[3]).toMatchObject({ kind: 'travel', side: 'after' })
  })

  it('draws no travel when the buffer is 0', () => {
    expect(buildAgenda([blessing], 0).every((e) => e.kind === 'item')).toBe(true)
  })

  it('never runs past midnight or before it', () => {
    const late: ScheduleItem = { ...blessing, start: '00:10', end: '23:50' }
    const [before, , after] = buildAgenda([late], 30)
    expect(before).toMatchObject({ start: '00:00' })
    expect(after).toMatchObject({ end: '23:59' })
  })
})
