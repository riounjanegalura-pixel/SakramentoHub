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

  it('primary buttons are 56 px, outline and secondary 48, text-style 44, and no size shrinks on desktop except the small icon ones', () => {
    render(
      <>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
        <Button size="sm">Small</Button>
        <Button size="xs">Tiny</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
        <Button size="icon" aria-label="Icon" />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Default' })).toHaveClass('min-h-[56px]')
    expect(screen.getByRole('button', { name: 'Large' })).toHaveClass('min-h-[56px]')
    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass('min-h-[48px]')
    expect(screen.getByRole('button', { name: 'Small' }).className).not.toMatch(/lg:min-h/)
    expect(screen.getByRole('button', { name: 'Tiny' })).toHaveClass('min-h-[44px]')
    for (const name of ['Outline', 'Secondary']) expect(screen.getByRole('button', { name })).toHaveClass('min-h-[48px]')
    for (const name of ['Ghost', 'Link']) expect(screen.getByRole('button', { name })).toHaveClass('min-h-[44px]')
    expect(screen.getByRole('button', { name: 'Icon' })).toHaveClass('size-11')
  })

  it('inverse is paper with navy text, for use on a navy Panel', () => {
    render(<Button variant="inverse">Pay with GCash</Button>)
    expect(screen.getByRole('button', { name: 'Pay with GCash' })).toHaveClass('bg-paper', 'text-navy', 'min-h-[56px]')
  })

  it('keeps the body type role beside the text colour', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('text-body', 'text-white')
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
