import { describe, it, expect } from 'vitest'
import { holdLapsed, paymentHoldExpired, EVENT_CATEGORIES, eventCategoryLabel, formatManilaDateTime24 } from './domain'

// Copied from the parishioner app's lib/domain (the apps share no code); the journey rail mapping reads them.
describe('paymentHoldExpired', () => {
  it('is true only when a hold time is set and has passed', () => {
    expect(paymentHoldExpired({ paymentHoldExpiresAt: null })).toBe(false)
    expect(paymentHoldExpired({ paymentHoldExpiresAt: new Date(Date.now() + 3600_000).toISOString() })).toBe(false)
    expect(paymentHoldExpired({ paymentHoldExpiresAt: new Date(Date.now() - 3600_000).toISOString() })).toBe(true)
  })
})

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
})

describe('event categories', () => {
  it('lists the parish event categories with readable labels', () => {
    expect(EVENT_CATEGORIES).toEqual([
      { value: 'mass', label: 'Mass' },
      { value: 'feast', label: 'Feast day' },
      { value: 'seminar', label: 'Seminar' },
      { value: 'fundraiser', label: 'Fundraiser' },
      { value: 'community', label: 'Community' },
      { value: 'notice', label: 'Notice' },
      { value: 'general', label: 'Parish event' },
      { value: 'other', label: 'Other' },
    ])
  })
  it('labels a known category and shows an unknown legacy value as-is', () => {
    expect(eventCategoryLabel('feast')).toBe('Feast day')
    expect(eventCategoryLabel('baptism')).toBe('baptism')
  })
})

describe('formatManilaDateTime24', () => {
  it('shows the parish-local date with a 24-hour time', () => {
    // 14:45 UTC is 22:45 in Manila (UTC+8), and 00:05 UTC is 08:05, with a leading zero and no AM/PM.
    expect(formatManilaDateTime24('2026-11-15T14:45:00Z')).toMatch(/Nov 15, 2026,? 22:45/)
    expect(formatManilaDateTime24('2026-11-15T00:05:00Z')).toMatch(/Nov 15, 2026,? 08:05/)
    expect(formatManilaDateTime24('2026-11-15T16:30:00Z')).not.toMatch(/AM|PM/i)
  })
})
