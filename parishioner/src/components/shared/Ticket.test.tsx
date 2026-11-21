import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Ticket } from './Ticket'
import { STATUS_LABEL } from '../../lib/domain'

const base = {
  kind: 'baptism' as const,
  title: 'Baptism · Maria Santos',
  time: '9:00 am',
  status: 'submitted' as const,
  reference: 'BAP-2026-0007',
}

describe('Ticket', () => {
  it('shows what, when, how it stands and the register number', () => {
    render(<Ticket {...base} date="2026-11-07" />)
    expect(screen.getByText('Baptism · Maria Santos')).toBeInTheDocument()
    expect(screen.getByText('9:00 am')).toBeInTheDocument()
    expect(screen.getByText(STATUS_LABEL.submitted)).toBeInTheDocument()
    expect(screen.getByText('BAP-2026-0007')).toHaveClass('numeric')
    expect(screen.getByText('Saturday 7 November')).toBeInTheDocument()
  })

  it('tears the stub off with a dashed line in the hollow shape colour', () => {
    const { container } = render(<Ticket {...base} date="2026-11-07" />)
    expect(container.querySelector('[data-slot="ticket-stub"]')).toHaveClass('border-dashed', 'border-hollow', 'bg-paper-deep')
  })

  it('is one link when it is given a destination', () => {
    render(
      <MemoryRouter>
        <Ticket {...base} date="2026-11-07" to="/booking/history/7" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/booking/history/7')
  })

  it('is plain content without one', () => {
    render(<Ticket {...base} date="2026-11-07" />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('a draft has no date, so the stub carries the emblem alone', () => {
    const { container } = render(<Ticket {...base} status="draft" time="No date chosen yet" date={null} />)
    expect(container.querySelector('time')).toBeNull()
    expect(screen.getByText('No date chosen yet')).toBeInTheDocument()
    expect(screen.getByText(STATUS_LABEL.draft)).toBeInTheDocument()
  })

  it('lets the title column shrink, so a long name wraps instead of widening the page', () => {
    const { container } = render(<Ticket {...base} date="2026-11-07" />)
    expect(container.querySelector('[data-slot="ticket"]')?.className).toMatch(/minmax\(0,1fr\)/)
  })
})
