import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { Card } from './card'
import { Badge } from './badge'
import { Input } from './input'
import { Textarea } from './textarea'
import { Skeleton } from './skeleton'

describe('Card', () => {
  it('is a white 16 px card with a hairline border and no shadow at rest', () => {
    render(<Card data-testid="c" />)
    expect(screen.getByTestId('c')).toHaveClass('bg-surface', 'rounded-2xl', 'border-line')
  })
})

describe('Badge', () => {
  it('uses token classes and keeps a rounded pill', () => {
    render(<Badge>New</Badge>)
    expect(screen.getByText('New')).toHaveClass('rounded-full', 'bg-navy', 'text-white')
  })
})

describe('Input and Textarea', () => {
  it('Input has the input-border outline, 44 px touch height and the focus ring', () => {
    render(<Input aria-label="Name" />)
    expect(screen.getByLabelText('Name')).toHaveClass(
      'border-input-border',
      'min-h-[44px]',
      'focus-visible:ring-focus',
    )
  })

  it('Input aria-invalid styling uses danger', () => {
    render(<Input aria-label="Name" />)
    expect(screen.getByLabelText('Name')).toHaveClass('aria-invalid:border-danger')
  })

  it('Textarea shares the same border, height and invalid styling', () => {
    render(<Textarea aria-label="Notes" />)
    expect(screen.getByLabelText('Notes')).toHaveClass(
      'border-input-border',
      'min-h-[44px]',
      'focus-visible:ring-focus',
      'aria-invalid:border-danger',
    )
  })
})

describe('Skeleton', () => {
  it('is a static line-coloured block with no pulse', () => {
    render(<Skeleton data-testid="s" />)
    const el = screen.getByTestId('s')
    expect(el).toHaveClass('bg-line')
    expect(el.className).not.toMatch(/animate-/)
    const src = readFileSync(join(import.meta.dirname, 'skeleton.tsx'), 'utf8')
    expect(src).not.toContain('animate-pulse')
  })
})
