import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { DateBlock } from './DateBlock'

describe('DateBlock', () => {
  it('shows weekday, day and month, and reads aloud as one full date', () => {
    const { container } = render(<DateBlock date="2026-11-07" />)
    const time = container.querySelector('time')
    expect(time).toHaveAttribute('datetime', '2026-11-07')
    expect(screen.getByText('Saturday 7 November')).toHaveClass('sr-only')
    expect(screen.getByText('Sat')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('7')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Nov')).toHaveAttribute('aria-hidden', 'true')
  })

  it('takes a Date as well as a date string', () => {
    render(<DateBlock date={new Date(2026, 10, 14)} />)
    expect(screen.getByText('Saturday 14 November')).toBeInTheDocument()
  })

  it('a date that has gone steps back to the muted ink', () => {
    render(<DateBlock date="2026-10-03" past />)
    expect(screen.getByText('3')).toHaveClass('text-ink-muted')
    expect(screen.getByText('3')).not.toHaveClass('text-ink')
  })

  it('the large block has a bigger numeral than the default one', () => {
    const { rerender } = render(<DateBlock date="2026-11-07" />)
    const small = screen.getByText('7').className
    rerender(<DateBlock date="2026-11-07" size="lg" />)
    expect(screen.getByText('7').className).not.toBe(small)
    expect(screen.getByText('7')).toHaveClass('text-[3.25rem]')
  })

  it('keeps every piece at 14 px or more', () => {
    render(<DateBlock date="2026-11-07" />)
    expect(screen.getByText('Sat')).toHaveClass('text-label')
    expect(screen.getByText('Nov')).toHaveClass('text-label')
  })

  it('decorative: hidden from a screen reader and carries no <time> of its own', () => {
    const { container } = render(<DateBlock date="2026-11-07" decorative />)
    expect(container.querySelector('time')).toBeNull()
    expect(container.querySelector('[data-slot="date-block"]')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('keeps a two-digit day on one line', () => {
    render(<DateBlock date="2026-11-12" decorative />)
    expect(screen.getByText('12')).toHaveClass('whitespace-nowrap')
  })
})
