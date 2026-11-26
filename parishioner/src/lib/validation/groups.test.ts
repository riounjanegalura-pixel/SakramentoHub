import { describe, it, expect, afterEach, vi } from 'vitest'
import { z } from 'zod'
import { personShape, sponsorShape, addressShape, NAME_PATTERN, loose, refineWith, yearsBefore } from './groups'

describe('field groups', () => {
  it('accepts Filipino names with accents, Ñ, periods and hyphens', () => {
    for (const name of ['José Miguel', 'Ñiguez', 'Dela Cruz-Santos', 'Ma. Teresa', "D'Souza"]) {
      expect(NAME_PATTERN.test(name)).toBe(true)
    }
    expect(NAME_PATTERN.test('Juan123')).toBe(false)
  })

  it('person group requires names and the enabled extras', () => {
    const schema = z.object(personShape('child', { dob: true, placeOfBirth: true, sex: true }))
    const result = schema.safeParse({ childFirstName: 'Ana' })
    const keys = result.success ? [] : result.error.issues.map((i) => i.path.join('.'))
    expect(keys).toEqual(expect.arrayContaining(['childLastName', 'childDateOfBirth', 'childPlaceOfBirth', 'childSex']))
  })

  describe('minimum age uses the Manila parish date', () => {
    afterEach(() => vi.useRealTimers())
    const groom = (dob: string) =>
      z.object(personShape('groom', { dob: true, minAgeYears: 18 })).safeParse({ groomFirstName: 'A', groomLastName: 'B', groomDateOfBirth: dob }).success

    it('cutoff is exact relative to Manila today, not UTC', () => {
      // 17:30 UTC on 30 Apr is already 1 May in Manila.
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-30T17:30:00Z'))
      expect(groom('2008-05-01')).toBe(true)
      expect(groom('2008-05-02')).toBe(false)
    })

    it('Feb 29 clamps to Feb 28 when subtracting years', () => {
      expect(yearsBefore('2028-02-29', 18)).toBe('2010-02-28')
      expect(yearsBefore('2028-02-29', 4)).toBe('2024-02-29')
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2028-02-28T04:00:00Z'))
      expect(groom('2010-02-28')).toBe(true)
      expect(groom('2010-03-01')).toBe(false)
    })
  })

  it('optional fields accept null from the API', () => {
    const schema = z.object({ ...personShape('x'), ...addressShape('addr', false) })
    expect(schema.safeParse({ xFirstName: 'A', xLastName: 'B', xMiddleName: null, xSuffix: null, addr: null, addrLine: null, addrRegionCode: null }).success).toBe(true)
  })

  it('sponsor list enforces count, numbers and religion values', () => {
    const schema = z.object(sponsorShape(1, 1, 16))
    const ok = { role: 'ninang', firstName: 'Grace', lastName: 'Mendoza', age: 40, religion: 'Roman Catholic', residence: 'Bocaue, Bulacan' }
    expect(schema.safeParse({ sponsors: [ok] }).success).toBe(true)
    expect(schema.safeParse({ sponsors: [] }).success).toBe(false)
    expect(schema.safeParse({ sponsors: [{ ...ok, age: 12 }] }).success).toBe(false)
    expect(schema.safeParse({ sponsors: [{ ...ok, religion: 'Catholic' }] }).success).toBe(false)
  })

  it('a sponsor needs no address: missing, empty or null all pass', () => {
    const schema = z.object(sponsorShape(1, 1, 16))
    const noAddress = { role: 'ninong', firstName: 'Pedro', lastName: 'Reyes', age: 34, religion: 'Roman Catholic' }
    expect(schema.safeParse({ sponsors: [noAddress] }).success).toBe(true)
    expect(schema.safeParse({ sponsors: [{ ...noAddress, residence: '' }] }).success).toBe(true)
    expect(schema.safeParse({ sponsors: [{ ...noAddress, residence: null, residenceLine: null }] }).success).toBe(true)
  })

  it('optional address group still validates the line length', () => {
    const schema = z.object(addressShape('houseMassAddress', false))
    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.safeParse({ houseMassAddressLine: 'x'.repeat(255) }).success).toBe(true)
    expect(schema.safeParse({ houseMassAddressLine: 'x'.repeat(256) }).success).toBe(false)
  })

  it('refineWith applies a strict group only when a condition holds', () => {
    const strict = z.object(personShape('father'))
    const schema = z.looseObject(loose(personShape('father'))).superRefine((d, ctx) => {
      if (!d.fatherOmitted) refineWith(ctx, strict, d)
    })
    expect(schema.safeParse({ fatherOmitted: true }).success).toBe(true)
    const r = schema.safeParse({ fatherOmitted: false })
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join('.'))).toContain('fatherFirstName')
  })
})
