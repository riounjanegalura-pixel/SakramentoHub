import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { Button } from './button'

describe('Button', () => {
  it('default is the navy primary with white text, 12 px radius and no shadow', () => {
    render(<Button>Save</Button>)
    const el = screen.getByRole('button', { name: 'Save' })
    expect(el).toHaveClass('bg-navy', 'text-white', 'rounded-xl')
    expect(el.className.split(/\s+/).filter((c) => /(^|:)shadow/.test(c))).toEqual([])
  })

  it('navy is a navy fill with white text', () => {
    render(<Button variant="navy">Back</Button>)
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('bg-navy', 'text-white')
  })

  it('outline, ghost and destructive use token classes', () => {
    render(
      <>
        <Button variant="outline">Out</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Delete</Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Out' })).toHaveClass('border-line')
    expect(screen.getByRole('button', { name: 'Ghost' })).toHaveClass('text-navy')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('bg-danger', 'text-white')
  })

  it('every size is at least 44 px tall on touch; sm drops to 40 px only on desktop', () => {
    render(
      <>
        <Button>Default</Button>
        <Button size="sm">Small</Button>
        <Button size="icon" aria-label="Icon" />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Default' })).toHaveClass('min-h-[52px]')
    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass('min-h-[44px]', 'lg:min-h-10')
    expect(screen.getByRole('button', { name: 'Icon' })).toHaveClass('size-11')
  })

  it('a long label wraps instead of overflowing', () => {
    render(<Button>Request the Anointing of the Sick for a family member</Button>)
    const el = screen.getByRole('button')
    expect(el).toHaveClass('whitespace-normal')
    expect(el).not.toHaveClass('whitespace-nowrap')
  })

  it('keyboard focus uses the focus token ring with a 2 px white offset', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button')).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-focus',
      'focus-visible:ring-offset-2',
      'focus-visible:ring-offset-white',
    )
  })

  it('asChild renders the child element with the button styling', () => {
    render(
      <Button asChild>
        <a href="/x">Link</a>
      </Button>,
    )
    expect(screen.getByRole('link', { name: 'Link' })).toHaveClass('bg-navy')
  })

  it('has no transition or animate utility classes (motion library only)', () => {
    const src = readFileSync(join(import.meta.dirname, 'button.tsx'), 'utf8')
    const classes = (src.match(/"[^"]*"/g) ?? []).flatMap((s) => s.slice(1, -1).split(/\s+/))
    expect(classes.filter((c) => /^(?:[a-z-]+:)*(?:transition|animate)(?:-|$)/.test(c))).toEqual([])
  })
})
