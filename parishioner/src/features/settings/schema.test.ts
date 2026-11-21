import { describe, it, expect } from 'vitest'
import { profileSchema, changePasswordSchema, deleteAccountSchema } from './schema'

describe('profileSchema', () => {
  it('rejects a missing contact number', () => {
    const result = profileSchema.safeParse({
      fullName: 'Rio Galura',
      email: 'rio@example.com',
      address: '123 Rizal Street',
    })
    expect(result.success).toBe(false)
  })
  it('accepts a complete profile', () => {
    const result = profileSchema.safeParse({
      fullName: 'Rio Galura',
      email: 'rio@example.com',
      phone: '09123456789',
      birthDate: '1990-05-01',
      sex: 'female',
      addressLine: '123 Rizal Street',
    })
    expect(result.success).toBe(true)
  })
})

describe('profileSchema address and birth date', () => {
  const base = { fullName: 'Rio Galura', email: 'rio@example.com', phone: '09123456789', birthDate: '1990-05-01', sex: 'female' }

  it('blocks a partly chosen address (codes without a display)', () => {
    const result = profileSchema.safeParse({ ...base, addressPsgc: '', addressPsgcRegionCode: '03' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Choose at least a city or municipality')
    expect(result.error?.issues[0].path).toEqual(['addressPsgc'])
  })

  it('accepts an empty address and a completed one', () => {
    expect(profileSchema.safeParse({ ...base, addressPsgc: '' }).success).toBe(true)
    expect(profileSchema.safeParse({ ...base, addressPsgc: 'Balagtas, Bulacan', addressPsgcRegionCode: '03' }).success).toBe(true)
  })

  it('rejects a future date of birth', () => {
    expect(profileSchema.safeParse({ ...base, birthDate: '2999-01-01' }).success).toBe(false)
  })
})

describe('changePasswordSchema', () => {
  it('rejects when new and confirm passwords do not match', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'password123',
      newPassword: 'newpassword456',
      confirmPassword: 'somethingelse',
    })
    expect(result.success).toBe(false)
  })
  it('accepts matching passwords of sufficient length', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'password123',
      newPassword: 'newpassword456',
      confirmPassword: 'newpassword456',
    })
    expect(result.success).toBe(true)
  })
})

describe('deleteAccountSchema', () => {
  it('rejects when the irreversibility checkbox is not confirmed', () => {
    const result = deleteAccountSchema.safeParse({
      currentPassword: 'password123',
      confirmDeletion: false,
    })
    expect(result.success).toBe(false)
  })
  it('rejects a missing current password', () => {
    const result = deleteAccountSchema.safeParse({
      currentPassword: '',
      confirmDeletion: true,
    })
    expect(result.success).toBe(false)
  })
  it('accepts a confirmed password and checkbox', () => {
    const result = deleteAccountSchema.safeParse({
      currentPassword: 'password123',
      confirmDeletion: true,
    })
    expect(result.success).toBe(true)
  })
})
