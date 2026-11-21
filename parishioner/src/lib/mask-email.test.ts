import { describe, it, expect } from 'vitest'
import { maskEmail } from './mask-email'

describe('maskEmail', () => {
  it('keeps the first character of the local-part and masks the rest', () => {
    expect(maskEmail('rio@example.com')).toBe('r***@example.com')
  })

  it('keeps the full domain intact', () => {
    expect(maskEmail('a@sub.domain.co')).toBe('a***@sub.domain.co')
  })

  it('returns the input unchanged when it has no @', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email')
  })
})
