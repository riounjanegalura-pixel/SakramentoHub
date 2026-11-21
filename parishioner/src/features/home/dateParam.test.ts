import { describe, expect, it } from 'vitest'
import { parseDateParam } from './dateParam'

const TODAY = new Date(2026, 10, 5, 12, 0, 0)
const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()]

describe('parseDateParam', () => {
  it('reads a real YYYY-MM-DD as that local day', () => {
    expect(ymd(parseDateParam('2026-12-03', TODAY))).toEqual([2026, 12, 3])
    expect(ymd(parseDateParam('2028-02-29', TODAY))).toEqual([2028, 2, 29])
  })

  it.each([null, '', 'nonsense', '2026-13-01', '2026-02-30', '2027-02-29', '2026-1-5', '26-01-01', '2026-01-01T10:00', ' 2026-01-01'])(
    'falls back to today for %j',
    (value) => {
      expect(ymd(parseDateParam(value, TODAY))).toEqual([2026, 11, 5])
    },
  )

  it('falls back to today when the year is out of range', () => {
    expect(ymd(parseDateParam('1999-12-31', TODAY))).toEqual([2026, 11, 5])
    expect(ymd(parseDateParam('2101-01-01', TODAY))).toEqual([2026, 11, 5])
    expect(ymd(parseDateParam('0000-01-01', TODAY))).toEqual([2026, 11, 5])
    expect(ymd(parseDateParam('9999-12-31', TODAY))).toEqual([2026, 11, 5])
  })

  it('does not return today by reference', () => {
    expect(parseDateParam(null, TODAY)).not.toBe(TODAY)
  })
})
