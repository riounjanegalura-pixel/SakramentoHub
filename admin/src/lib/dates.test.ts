import { describe, expect, it } from 'vitest'
import { dayTitle, monthBounds, monthGrid, monthTitle, shiftMonth } from './dates'

describe('dates', () => {
  it('monthBounds covers the whole month, including a leap February', () => {
    expect(monthBounds('2026-11-15')).toEqual({ start: '2026-11-01', end: '2026-11-30' })
    expect(monthBounds('2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })

  it('shiftMonth returns the first day of the neighbouring month across year ends', () => {
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-01')
    expect(shiftMonth('2026-01-31', -1)).toBe('2025-12-01')
    expect(shiftMonth('2026-11-02', 0)).toBe('2026-11-01')
  })

  it('monthGrid lays out Sunday-first weeks padded with nulls', () => {
    const nov = monthGrid('2026-11-10') // Nov 1 2026 is a Sunday
    expect(nov).toHaveLength(5)
    expect(nov[0][0]).toBe('2026-11-01')
    expect(nov[4]).toEqual(['2026-11-29', '2026-11-30', null, null, null, null, null])

    const oct = monthGrid('2026-10-01') // Oct 1 2026 is a Thursday
    expect(oct[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03'])
    expect(oct.flat().filter(Boolean)).toHaveLength(31)
  })

  it('formats titles', () => {
    expect(monthTitle('2026-11-02')).toBe('November 2026')
    expect(dayTitle('2026-11-02')).toBe('Monday, November 2, 2026')
  })
})
