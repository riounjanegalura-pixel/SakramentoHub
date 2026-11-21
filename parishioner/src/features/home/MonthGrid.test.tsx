import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import { MonthGrid } from './MonthGrid'

describe('MonthGrid', () => {
  it('renders every day of the given month', () => {
    render(
      <MonthGrid month={new Date(2026, 2, 1)} markedDates={[]} selectedDate={null} onSelectDate={() => {}} />,
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('31')).toBeInTheDocument() // March 2026 has 31 days
  })

  it('calls onSelectDate with the clicked date', () => {
    const onSelectDate = vi.fn()
    render(
      <MonthGrid month={new Date(2026, 2, 1)} markedDates={[]} selectedDate={null} onSelectDate={onSelectDate} />,
    )
    fireEvent.click(screen.getByText('16'))
    expect(onSelectDate).toHaveBeenCalledWith(new Date(2026, 2, 16))
  })

  it('marks days that appear in markedDates', () => {
    render(
      <MonthGrid
        month={new Date(2026, 2, 1)}
        markedDates={[new Date(2026, 2, 16)]}
        selectedDate={null}
        onSelectDate={() => {}}
      />,
    )
    expect(screen.getByText('16').closest('button')).toHaveAttribute('data-marked', 'true')
  })

  describe('as a calendar', () => {
    const TODAY = new Date(2026, 2, 10, 12, 0, 0)
    const dayOf = (name: RegExp | string) => screen.getByRole('button', { name })
    function grid(selected: Date | null = null, marked: Date[] = []) {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(TODAY)
      render(<MonthGrid month={new Date(2026, 2, 1)} markedDates={marked} selectedDate={selected} onSelectDate={() => {}} />)
    }
    afterEach(() => vi.useRealTimers())

    it('names each day by its date and how many items it has', () => {
      grid(null, [new Date(2026, 2, 16, 8), new Date(2026, 2, 16, 10), new Date(2026, 2, 17, 9)])
      expect(dayOf('Mar 16, 2026, 2 items')).toBeInTheDocument()
      expect(dayOf('Mar 17, 2026, 1 item')).toBeInTheDocument()
      expect(dayOf('Mar 18, 2026')).toBeInTheDocument()
    })

    it('rings today in navy at 2 px and fills the selected day navy with white text', () => {
      grid(new Date(2026, 2, 20))
      const today = dayOf(/^Mar 10, 2026/)
      expect(today).toHaveAttribute('aria-current', 'date')
      const todayDisc = today.querySelector('[data-day]')!
      expect(todayDisc.className).toMatch(/ring-2/)
      expect(todayDisc.className).toMatch(/ring-navy/)
      expect(todayDisc.className).not.toMatch(/bg-navy/)
      const picked = dayOf(/^Mar 20, 2026/)
      expect(picked).toHaveAttribute('aria-pressed', 'true')
      const pickedDisc = picked.querySelector('[data-day]')!
      expect(pickedDisc.className).toMatch(/bg-navy/)
      expect(pickedDisc.className).toMatch(/text-white/)
      expect(dayOf(/^Mar 21, 2026/)).toHaveAttribute('aria-pressed', 'false')
    })

    it('gives every day a 44 px target and keeps today ringed when it is also selected', () => {
      grid(TODAY)
      const today = dayOf(/^Mar 10, 2026/)
      expect(today.className).toMatch(/h-11/)
      const disc = today.querySelector('[data-day]')!
      expect(disc.className).toMatch(/bg-navy/)
      expect(disc.className).toMatch(/ring-navy/)
    })

    it('uses surface and line tokens, never raw colours', () => {
      grid()
      const html = document.body.innerHTML
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
      expect(html).not.toMatch(/brand-gold/)
    })
  })
})
