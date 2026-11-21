import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Calendar } from './calendar'

describe('Calendar', () => {
  it('shows the month and selects a day', async () => {
    const onSelect = vi.fn()
    render(
      <Calendar
        mode="single"
        selected={new Date(2026, 9, 8)}
        month={new Date(2026, 9, 1)}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByText(/October 2026/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /15/ }))
    expect(onSelect).toHaveBeenCalled()
  })
})
