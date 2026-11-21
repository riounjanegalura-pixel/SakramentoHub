import { describe, it, expect } from 'vitest'
import { loginSchema, registerSchema, forgotPasswordSchema, resetPasswordSchema, normalizePhone } from './schema'

describe('loginSchema', () => {
  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'password123' })
    expect(result.success).toBe(false)
  })
  it('accepts a valid login', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'password123' })
    expect(result.success).toBe(true)
  })
})

describe('registerSchema', () => {
  it('rejects a phone number missing the leading 09', () => {
    const result = registerSchema.safeParse({
      fullName: 'Rio Dela Cruz',
      email: 'rio@example.com',
      phone: '1234567890',
      password: 'password123',
    })
    expect(result.success).toBe(false)
  })
  it('accepts a valid registration', () => {
    const result = registerSchema.safeParse({
      fullName: 'Rio Dela Cruz',
      email: 'rio@example.com',
      phone: '09171234567',
      birthDate: '1990-05-01',
      sex: 'male',
      password: 'password123',
      privacyConsent: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a future date of birth', () => {
    const result = registerSchema.safeParse({
      fullName: 'Rio Dela Cruz',
      email: 'rio@example.com',
      phone: '09171234567',
      birthDate: '2999-01-01',
      sex: 'male',
      password: 'password123',
      privacyConsent: true,
    })
    expect(result.success).toBe(false)
  })

  it('rejects registration without privacy consent', () => {
    const result = registerSchema.safeParse({
      fullName: 'Rio Dela Cruz',
      email: 'rio@example.com',
      phone: '09171234567',
      password: 'password123',
      privacyConsent: false,
    })
    expect(result.success).toBe(false)
  })
})

describe('forgotPasswordSchema', () => {
  it('rejects an invalid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'not-an-email' }).success).toBe(false)
  })
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.com' }).success).toBe(true)
  })
})

describe('resetPasswordSchema', () => {
  it('rejects a password shorter than 8 characters', () => {
    const result = resetPasswordSchema.safeParse({ password: 'short', passwordConfirmation: 'short' })
    expect(result.success).toBe(false)
  })
  it('rejects mismatched passwords', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'password123',
      passwordConfirmation: 'different123',
    })
    expect(result.success).toBe(false)
  })
  it('accepts matching, long-enough passwords', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'password123',
      passwordConfirmation: 'password123',
    })
    expect(result.success).toBe(true)
  })
})

describe('normalizePhone', () => {
  it.each([
    ['0912 345 6789', '09123456789'],
    ['0912-345-6789', '09123456789'],
    ['+63 912 345 6789', '09123456789'],
    ['639123456789', '09123456789'],
    ['9123456789', '09123456789'],
  ])('turns %s into %s', (typed, expected) => {
    expect(normalizePhone(typed)).toBe(expected)
  })

  it('still refuses a number that is not a PH mobile', () => {
    expect(registerSchema.safeParse({ fullName: 'Maria Santos', birthDate: '1994-03-14', sex: 'female', email: 'm@x.com', phone: '1234567890', password: 'password123', privacyConsent: true }).success).toBe(false)
  })

  it('accepts a spaced number and hands on the clean one', () => {
    const r = registerSchema.safeParse({ fullName: 'Maria Santos', birthDate: '1994-03-14', sex: 'female', email: 'm@x.com', phone: '0912 345 6789', password: 'password123', privacyConsent: true })
    expect(r.success && r.data.phone).toBe('09123456789')
  })
})
