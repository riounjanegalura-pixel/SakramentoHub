import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { StatusPill } from './StatusPill'
import { STATUS_LABEL } from '../../lib/domain'
import type { BookingStatus } from '../../lib/types'

const TOKEN: Record<BookingStatus, string[]> = {
  draft: ['bg-paper', 'text-ink-muted'],
  submitted: ['bg-status-pending-bg', 'text-status-pending-fg'],
  returned: ['bg-status-rejected-bg', 'text-status-rejected-fg'],
  approved: ['bg-status-confirmed-bg', 'text-status-confirmed-fg'],
  completed: ['bg-status-done-bg', 'text-status-done-fg'],
  declined: ['bg-status-rejected-bg', 'text-status-rejected-fg'],
  cancelled: ['bg-paper', 'text-ink-muted'],
}

describe('StatusPill', () => {
  it('shows the status label, and wraps it rather than widening the page at large text', () => {
    render(<StatusPill status="approved" />)
    const pill = screen.getByText(STATUS_LABEL.approved)
    expect(pill).toHaveAttribute('data-slot', 'badge')
    expect(pill).toHaveClass('max-w-full', 'whitespace-normal')
  })

  it.each(Object.keys(TOKEN) as BookingStatus[])('%s uses its token pair, an icon and the text label', (status) => {
    render(<StatusPill status={status} />)
    const pill = screen.getByText(STATUS_LABEL[status])
    for (const c of TOKEN[status]) expect(pill).toHaveClass(c)
    const icon = pill.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('is at least 32 px tall with 15 px text and an 18 px icon, and outlines itself in its own colour', () => {
    render(<StatusPill status="approved" />)
    const pill = screen.getByText(STATUS_LABEL.approved)
    expect(pill).toHaveClass('min-h-8', 'text-note', 'border-current', '[&>svg]:size-[18px]')
  })

  it('a draft is outlined with a dashed line, so it differs from Cancelled without relying on colour', () => {
    render(
      <>
        <StatusPill status="draft" />
        <StatusPill status="cancelled" />
      </>,
    )
    expect(screen.getByText(STATUS_LABEL.draft)).toHaveClass('border-dashed')
    expect(screen.getByText(STATUS_LABEL.cancelled)).not.toHaveClass('border-dashed')
  })

  it('Needs changes and Declined share the red pair but have their own icon and words', () => {
    render(
      <>
        <StatusPill status="returned" />
        <StatusPill status="declined" />
      </>,
    )
    const [a, b] = [screen.getByText(STATUS_LABEL.returned), screen.getByText(STATUS_LABEL.declined)]
    expect(a.querySelector('svg')?.outerHTML).not.toBe(b.querySelector('svg')?.outerHTML)
    expect(a.textContent).not.toBe(b.textContent)
  })

  it('merges a caller class', () => {
    render(<StatusPill status="submitted" className="ml-2" />)
    expect(screen.getByText(STATUS_LABEL.submitted)).toHaveClass('ml-2')
  })
})
