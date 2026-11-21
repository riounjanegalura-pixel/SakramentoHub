import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MonthGrid } from '../features/dashboard/MonthGrid'

function setup() {
  const onSelect = vi.fn()
  render(<MonthGrid month="2026-10-08" selected="2026-10-08" today="2026-10-08" days={[]} onSelect={onSelect} />)
  return onSelect
}

describe('keyboard: the Dashboard month calendar', () => {
  it('reaches every day with Tab, in date order, and each day has a name with its date', async () => {
    const user = userEvent.setup()
    setup()
    screen.getByRole('button', { name: /^October 1$/ }).focus()
    for (const n of [2, 3, 4]) {
      await user.tab()
      expect(screen.getByRole('button', { name: new RegExp(`^October ${n}$`) })).toHaveFocus()
    }
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: /^October 3$/ })).toHaveFocus()
  })

  it('opens the focused day with Enter and with Space', async () => {
    const user = userEvent.setup()
    const onSelect = setup()
    screen.getByRole('button', { name: /^October 5$/ }).focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith('2026-10-05')
    await user.tab()
    await user.keyboard(' ')
    expect(onSelect).toHaveBeenLastCalledWith('2026-10-06')
  })

  it('marks the selected day with aria-pressed and today with aria-current', () => {
    setup()
    const day = screen.getByRole('button', { name: /^October 8$/ })
    expect(day).toHaveAttribute('aria-pressed', 'true')
    expect(day).toHaveAttribute('aria-current', 'date')
  })
})
