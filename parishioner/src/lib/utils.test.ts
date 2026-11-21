import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('keeps a type role beside a colour, in either order', () => {
    expect(cn('text-body', 'text-white')).toBe('text-body text-white')
    expect(cn('text-white', 'text-label')).toBe('text-white text-label')
    expect(cn('text-display-xl', 'text-navy')).toBe('text-display-xl text-navy')
    expect(cn('text-amount', 'text-white')).toBe('text-amount text-white')
  })

  it('lets a later size win over an earlier one', () => {
    expect(cn('text-body', 'text-base')).toBe('text-base')
    expect(cn('text-note', 'text-label')).toBe('text-label')
  })

  it('still lets a later colour win over an earlier one, and a later class win over a conflicting one', () => {
    expect(cn('text-ink-muted', 'text-ink')).toBe('text-ink')
    expect(cn('min-h-[56px]', 'min-h-[48px]')).toBe('min-h-[48px]')
  })
})
