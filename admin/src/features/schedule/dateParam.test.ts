import { describe, expect, it } from 'vitest'
import { parseDateParam } from './dateParam'

describe('parseDateParam', () => {
  const today = '2026-10-12'

  it('keeps a real day', () => {
    expect(parseDateParam('2026-11-03', today)).toBe('2026-11-03')
    expect(parseDateParam('2028-02-29', today)).toBe('2028-02-29')
  })

  it('falls back to today for anything else', () => {
    for (const bad of [null, '', 'tomorrow', '2026-1-3', '2026-02-30', '2026-13-01', '1999-12-31', '2101-01-01', '2026-11-03T10:00']) {
      expect(parseDateParam(bad, today)).toBe(today)
    }
  })
})
