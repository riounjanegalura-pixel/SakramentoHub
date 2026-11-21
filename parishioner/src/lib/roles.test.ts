import { describe, it, expect } from 'vitest'
import { isStaffSide } from './roles'

describe('isStaffSide', () => {
  it('is true for staff and admin only', () => {
    expect(isStaffSide({ role: 'staff' })).toBe(true)
    expect(isStaffSide({ role: 'admin' })).toBe(true)
    expect(isStaffSide({ role: 'parishioner' })).toBe(false)
    expect(isStaffSide({})).toBe(false)
    expect(isStaffSide(null)).toBe(false)
    expect(isStaffSide(undefined)).toBe(false)
  })
})
