import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from './StatusBadge'
import { STATUS_LABEL } from '../../lib/domain'
import type { BookingStatus } from '../../lib/types'

const TOKEN: Record<BookingStatus, string[]> = {
  draft: ['bg-paper', 'text-ink-muted'],
  submitted: ['bg-status-pending-bg', 'text-status-pending-fg'],
  returned: ['bg-status-pending-bg', 'text-status-pending-fg'],
  approved: ['bg-status-confirmed-bg', 'text-status-confirmed-fg'],
  completed: ['bg-status-done-bg', 'text-status-done-fg'],
  declined: ['bg-status-rejected-bg', 'text-status-rejected-fg'],
  cancelled: ['bg-paper', 'text-ink-muted'],
}

describe('StatusBadge', () => {
  it('shows the status label on one line', () => {
    render(<StatusBadge status="approved" />)
    const pill = screen.getByText(STATUS_LABEL.approved)
    expect(pill).toHaveAttribute('data-slot', 'badge')
    expect(pill).toHaveClass('max-w-full', 'whitespace-nowrap', 'rounded-full', 'px-2.5', 'h-[26px]')
  })

  it.each(Object.keys(TOKEN) as BookingStatus[])('%s uses its token pair, an icon and the text label', (status) => {
    render(<StatusBadge status={status} />)
    const pill = screen.getByText(STATUS_LABEL[status])
    for (const c of TOKEN[status]) expect(pill).toHaveClass(c)
    const icon = pill.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('merges a caller class', () => {
    render(<StatusBadge status="submitted" className="ml-2" />)
    expect(screen.getByText(STATUS_LABEL.submitted)).toHaveClass('ml-2')
  })
})
