import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WebMonthCalendar } from './WebMonthCalendar'
import type { CalendarItem } from '../features/home/calendarItems'

const item = (id: string, title: string, d: Date, own = false): CalendarItem => ({ id, title, date: d, isOwnBooking: own })
const ITEMS: CalendarItem[] = [
  item('a', 'Sunday Mass', new Date(2026, 10, 8, 8, 0)),
  item('b', 'Wedding — Your Booking', new Date(2026, 10, 8, 10, 0), true),
  item('c', 'One', new Date(2026, 10, 12, 8, 0)),
  item('d', 'Two', new Date(2026, 10, 12, 9, 0)),
  item('e', 'Three', new Date(2026, 10, 12, 10, 0)),
  item('f', 'Four', new Date(2026, 10, 12, 11, 0)),
]

function setup(selected: Date | null = null) {
  const onSelect = vi.fn()
  const onMonthChange = vi.fn()
  render(<WebMonthCalendar month={new Date(2026, 10, 1)} items={ITEMS} selected={selected} onSelect={onSelect} onMonthChange={onMonthChange} />)
  return { onSelect, onMonthChange }
}

describe('WebMonthCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('shows the month name and the weekday headers', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument()
    for (const d of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) expect(screen.getByText(d)).toBeInTheDocument()
  })

  it('names each day by its date and item count', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Nov 8, 2026, 2 items' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nov 9, 2026' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Nov \d+, 2026/ })).toHaveLength(30)
  })

  it('uses the singular for one item', () => {
    render(<WebMonthCalendar month={new Date(2026, 10, 1)} items={[ITEMS[0]]} selected={null} onSelect={() => {}} onMonthChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Nov 8, 2026, 1 item' })).toBeInTheDocument()
  })

  it('lists up to two titles in a day and +N more for the rest', () => {
    setup()
    const busy = screen.getByRole('button', { name: 'Nov 12, 2026, 4 items' })
    expect(busy).toHaveTextContent('One')
    expect(busy).toHaveTextContent('Two')
    expect(busy).not.toHaveTextContent('Three')
    expect(busy).toHaveTextContent('+2 more')
    expect(screen.getByRole('button', { name: 'Nov 8, 2026, 2 items' })).not.toHaveTextContent('more')
  })

  it('calls onSelect with the clicked date', async () => {
    const { onSelect } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Nov 8, 2026, 2 items' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    const d = onSelect.mock.calls[0][0] as Date
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 8])
  })

  it('asks for the previous and next month', async () => {
    const { onMonthChange } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onMonthChange.mock.calls).toEqual([[-1], [1]])
  })

  it('marks today with aria-current date', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Nov 5, 2026' })).toHaveAttribute('aria-current', 'date')
    expect(screen.getByRole('button', { name: 'Nov 6, 2026' })).not.toHaveAttribute('aria-current')
  })

  it('puts the 1st under its weekday and shows every day of a 29-day February', () => {
    render(<WebMonthCalendar month={new Date(2028, 1, 1)} items={[]} selected={null} onSelect={vi.fn()} onMonthChange={vi.fn()} />)
    const days = screen.getAllByRole('button').filter((b) => !/month$/i.test(b.getAttribute('aria-label') ?? ''))
    expect(days).toHaveLength(29)
    expect(days[0]).toHaveAccessibleName('Feb 1, 2028')
    expect(screen.queryByRole('button', { name: /Mar 1, 2028/ })).not.toBeInTheDocument()
    // Feb 1, 2028 is a Tuesday: two blank cells come first in the grid
    const grid = days[0].parentElement!
    expect(Array.from(grid.children).indexOf(days[0])).toBe(2)
  })

  it('pads the last row so the grid is whole weeks', () => {
    render(<WebMonthCalendar month={new Date(2028, 1, 1)} items={[]} selected={null} onSelect={vi.fn()} onMonthChange={vi.fn()} />)
    const grid = screen.getByRole('button', { name: 'Feb 1, 2028' }).parentElement!
    expect(grid.children.length % 7).toBe(0)
  })

  it('files a late-evening item under its own local day', () => {
    render(<WebMonthCalendar month={new Date(2026, 10, 1)} items={[item('e', 'Vigil', new Date(2026, 10, 8, 23, 30))]} selected={null} onSelect={vi.fn()} onMonthChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Nov 8, 2026, 1 item' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nov 9, 2026' })).toBeInTheDocument()
  })

  it('marks the selected day for assistive technology', () => {
    render(<WebMonthCalendar month={new Date(2026, 10, 1)} items={[]} selected={new Date(2026, 10, 12)} onSelect={vi.fn()} onMonthChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Nov 12, 2026' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Nov 13, 2026' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('rings today in navy and fills the selected day navy with white text', () => {
    render(<WebMonthCalendar month={new Date(2026, 10, 1)} items={[]} selected={new Date(2026, 10, 12)} onSelect={vi.fn()} onMonthChange={vi.fn()} />)
    const today = screen.getByRole('button', { name: 'Nov 5, 2026' }).querySelector('[data-day]')!
    expect(today.className).toMatch(/ring-2/)
    expect(today.className).toMatch(/ring-navy/)
    expect(today.className).not.toMatch(/bg-navy/)
    const picked = screen.getByRole('button', { name: 'Nov 12, 2026' }).querySelector('[data-day]')!
    expect(picked.className).toMatch(/bg-navy/)
    expect(picked.className).toMatch(/text-white/)
  })

  it('draws cells on the surface token over a line-token grid', () => {
    setup()
    const cell = screen.getByRole('button', { name: 'Nov 9, 2026' })
    expect(cell.className).toMatch(/bg-surface/)
    expect(cell.parentElement!.className).toMatch(/bg-line/)
  })

  it('makes the month buttons 44 px targets', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Previous month' }).className).toMatch(/size-11/)
    expect(screen.getByRole('button', { name: 'Next month' }).className).toMatch(/size-11/)
  })

  it('gives own bookings a navy-tinted chip and parish events a plain one, both with their text', () => {
    setup()
    const day = screen.getByRole('button', { name: 'Nov 8, 2026, 2 items' })
    expect(day).toHaveTextContent('Sunday Mass')
    expect(day).toHaveTextContent('Wedding — Your Booking')
  })
})
