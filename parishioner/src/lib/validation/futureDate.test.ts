import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { isTodayOrFutureDate, requireFutureDate, todayDateString } from './futureDate'

describe('isTodayOrFutureDate', () => {
  it('accepts today', () => {
    expect(isTodayOrFutureDate(todayDateString())).toBe(true)
  })
  it('accepts a future date', () => {
    expect(isTodayOrFutureDate('2099-01-01')).toBe(true)
  })
  it('rejects a past date', () => {
    expect(isTodayOrFutureDate('2000-01-01')).toBe(false)
  })
  it('accepts an empty string (not this helper\'s job to enforce required-ness)', () => {
    expect(isTodayOrFutureDate('')).toBe(true)
  })
})

describe('todayDateString', () => {
  it('returns an ISO YYYY-MM-DD string', () => {
    expect(todayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('requireFutureDate', () => {
  const schema = z.object({
    appointmentDate: requireFutureDate(z.string().min(1, 'Select an appointment date')),
  })

  it('rejects an empty date with the min-length message', () => {
    const result = schema.safeParse({ appointmentDate: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Select an appointment date')
    }
  })

  it('rejects a past date', () => {
    const result = schema.safeParse({ appointmentDate: '2000-01-01' })
    expect(result.success).toBe(false)
  })

  it('accepts today', () => {
    const result = schema.safeParse({ appointmentDate: todayDateString() })
    expect(result.success).toBe(true)
  })

  it('accepts a future date', () => {
    const result = schema.safeParse({ appointmentDate: '2099-01-01' })
    expect(result.success).toBe(true)
  })
})
