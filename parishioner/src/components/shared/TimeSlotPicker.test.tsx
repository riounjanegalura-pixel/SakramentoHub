import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimeSlotPicker } from './TimeSlotPicker'

function renderPicker(value: string | null = null, onChange = vi.fn()) {
  render(
    <>
      <p id="t">Start time</p>
      <TimeSlotPicker starts={['09:00', '10:30', '14:00']} value={value} onChange={onChange} labelId="t" />
    </>,
  )
  return onChange
}

describe('TimeSlotPicker', () => {
  it('lays the times two to a row, each a 56 px radio', () => {
    renderPicker()
    expect(screen.getByRole('radiogroup', { name: 'Start time' })).toHaveClass('grid-cols-2')
    for (const r of screen.getAllByRole('radio')) expect(r).toHaveClass('min-h-14', 'rounded-xl')
  })

  it('fills the chosen time navy and leaves the others on white', () => {
    renderPicker('10:30')
    expect(screen.getByRole('radio', { name: '10:30 AM' })).toHaveClass('bg-navy', 'text-white')
    expect(screen.getByRole('radio', { name: '9:00 AM' })).toHaveClass('bg-surface')
  })

  it('chooses a time on click', async () => {
    const onChange = renderPicker()
    await userEvent.click(screen.getByRole('radio', { name: '2:00 PM' }))
    expect(onChange).toHaveBeenCalledWith('14:00')
  })

  it('says so when no time is free', () => {
    render(<TimeSlotPicker starts={[]} value={null} onChange={() => {}} labelId="t" />)
    expect(screen.getByText(/No free times left on this day/)).toHaveClass('text-body')
  })
})
