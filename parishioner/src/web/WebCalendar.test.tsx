import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { WebCalendar } from './WebCalendar'
import { useAuthStore } from '../stores/auth-store'
import { setViewport } from '../test/viewport'
import { fetchBookings } from '../lib/data/bookings'
import { fetchUpcomingEvents } from '../lib/data/events'
import { expectNoA11yViolations } from '../test/a11y'

vi.mock('../lib/data/bookings', () => ({ fetchBookings: vi.fn() }))
vi.mock('../lib/data/events', () => ({ fetchUpcomingEvents: vi.fn() }))
vi.mock('../lib/data/notifications', () => ({ fetchNotifications: vi.fn(async () => []) }))
vi.mock('../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter the Apostle Parish', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

const original = window.matchMedia

const BOOKINGS = [
  {
    id: 'b1', referenceNumber: 'R', userId: 'u1', sacrament: 'wedding', status: 'approved', statusLabel: '', formData: {},
    appointmentDate: '2026-11-08', appointmentStart: '10:00', appointmentEnd: null, isEmergency: false, paymentStatus: null, amountDueCentavos: 0,
  },
]
const EVENTS = [
  { id: 'e1', title: 'Sunday Mass', date: '2026-11-08T08:00:00', location: 'Church', imageUrl: '', category: 'mass' },
  { id: 'e2', title: 'Today Rosary', date: '2026-11-05T17:30:00', location: 'Church', imageUrl: '', category: 'general' },
]

function renderCalendar(path = '/calendar') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <WebCalendar />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WebCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0))
    setViewport(1280)
    vi.mocked(fetchBookings).mockReset().mockResolvedValue(BOOKINGS as never)
    vi.mocked(fetchUpcomingEvents).mockReset().mockResolvedValue(EVENTS as never)
    useAuthStore.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '', emailVerifiedAt: '2026-01-01' } as never })
    Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false)
    Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {})
    Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {})
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    window.matchMedia = original
    useAuthStore.setState({ user: null })
  })

  it('shows the month grid with parish events and the own bookings', async () => {
    renderCalendar()
    expect(screen.getByRole('heading', { level: 1, name: 'Calendar' })).toBeInTheDocument()
    const day = await screen.findByRole('button', { name: 'Nov 8, 2026, 2 items' })
    expect(day).toHaveTextContent('Sunday Mass')
    expect(day).toHaveTextContent('Wedding — Your Booking')
  })

  it('opens on the day named in ?date=, with its month', async () => {
    renderCalendar('/calendar?date=2026-12-03')
    expect(screen.getByRole('heading', { name: /Thursday, Dec 3, 2026/ })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Dec 3, 2026' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens on today when ?date= is not a date', () => {
    renderCalendar('/calendar?date=nonsense')
    expect(screen.getByRole('heading', { name: /Thursday, Nov 5, 2026/ })).toBeInTheDocument()
  })

  it('filters to parish events or my bookings', async () => {
    renderCalendar()
    await screen.findByRole('button', { name: 'Nov 8, 2026, 2 items' })
    const all = screen.getByRole('button', { name: 'All' })
    expect(all).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Parish events' }))
    expect(screen.getByRole('button', { name: 'Parish events' })).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveAttribute('aria-pressed', 'false')
    const events = screen.getByRole('button', { name: 'Nov 8, 2026, 1 item' })
    expect(events).toHaveTextContent('Sunday Mass')
    expect(events).not.toHaveTextContent('Your Booking')

    await userEvent.click(screen.getByRole('button', { name: 'My bookings' }))
    const mine = screen.getByRole('button', { name: 'Nov 8, 2026, 1 item' })
    expect(mine).toHaveTextContent('Wedding — Your Booking')
    expect(mine).not.toHaveTextContent('Sunday Mass')
    expect(screen.getByRole('button', { name: 'Nov 5, 2026' })).toBeInTheDocument()
  })

  it('lists the day, with times, when a day is selected; own bookings link to the booking', async () => {
    renderCalendar()
    await userEvent.click(await screen.findByRole('button', { name: 'Nov 8, 2026, 2 items' }))
    const list = screen.getByRole('heading', { name: /Nov 8, 2026/ }).closest('section')!
    expect(within(list).getByText('Sunday Mass')).toBeInTheDocument()
    expect(within(list).getByText('8:00 AM')).toBeInTheDocument()
    expect(within(list).getByText('10:00 AM')).toBeInTheDocument()
    expect(within(list).getByRole('link', { name: /Wedding — Your Booking/ })).toHaveAttribute('href', '/booking/history/b1')
  })

  it('says Nothing on this day when the selected day is empty', async () => {
    renderCalendar()
    await userEvent.click(await screen.findByRole('button', { name: 'Nov 9, 2026' }))
    expect(screen.getByText('Nothing on this day.')).toBeInTheDocument()
  })

  it('defaults the day list to today', async () => {
    renderCalendar()
    const list = screen.getByRole('heading', { name: /Nov 5, 2026/ }).closest('section')!
    expect(await within(list).findByText('Today Rosary')).toBeInTheDocument()
    expect(within(list).getByText('5:30 PM')).toBeInTheDocument()
  })

  it('rolls the year when moving across December and January', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 11, 15))
    try {
      renderCalendar()
      expect(await screen.findByRole('heading', { name: 'December 2026' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
      expect(screen.getByRole('heading', { name: 'January 2027' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
      await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
      expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('offers Retry when the events cannot be loaded', async () => {
    vi.mocked(fetchUpcomingEvents).mockRejectedValueOnce(new Error('x'))
    renderCalendar()
    expect(await screen.findByText(/couldn.t load events/i)).toBeInTheDocument()
    expect(vi.mocked(fetchUpcomingEvents)).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole('button', { name: 'Nov 8, 2026, 2 items' })
    expect(vi.mocked(fetchUpcomingEvents)).toHaveBeenCalledTimes(2)
  })

  it('reads bookings only for the signed-in user', async () => {
    renderCalendar()
    await screen.findByRole('button', { name: 'Nov 8, 2026, 2 items' })
    expect(vi.mocked(fetchBookings)).toHaveBeenCalledWith('u1')
    for (const call of vi.mocked(fetchBookings).mock.calls) expect(call[0]).toBe('u1')
  })

  it('falls back to today when ?date= is out of range or not a real day', () => {
    for (const bad of ['1900-01-01', '9999-12-31', '2026-02-30']) {
      const { unmount } = renderCalendar('/calendar?date=' + bad)
      expect(screen.getByRole('heading', { name: /Thursday, Nov 5, 2026/ })).toBeInTheDocument()
      unmount()
    }
  })

  it('shows the time of each item in tabular figures (mono is for reference numbers only)', async () => {
    renderCalendar()
    const list = screen.getByRole('heading', { name: /Nov 5, 2026/ }).closest('section')!
    const time = await within(list).findByText('5:30 PM')
    expect(time.className).toMatch(/tabular-nums/)
  })

  it('shows a busy skeleton in the shape of the day list while loading', () => {
    vi.mocked(fetchUpcomingEvents).mockReturnValue(new Promise(() => {}))
    renderCalendar()
    const label = screen.getByText('Loading the schedule')
    expect(label.className).toMatch(/sr-only/)
    const busy = label.closest('[aria-busy]')!
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(1)
  })

  it('offers one action when the day is empty', async () => {
    renderCalendar()
    await userEvent.click(await screen.findByRole('button', { name: 'Nov 9, 2026' }))
    expect(screen.getByText('Nothing on this day.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Book a sacrament' })).toHaveAttribute('href', '/services')
  })

  it('has no accessibility violations loaded, empty and failed', async () => {
    const full = renderCalendar()
    await screen.findByRole('button', { name: 'Nov 8, 2026, 2 items' })
    await expectNoA11yViolations(full.container)
    full.unmount()
    vi.mocked(fetchUpcomingEvents).mockResolvedValue([])
    vi.mocked(fetchBookings).mockResolvedValue([])
    const empty = renderCalendar()
    await screen.findByText('Nothing on this day.')
    await expectNoA11yViolations(empty.container)
    empty.unmount()
    vi.mocked(fetchUpcomingEvents).mockRejectedValue(new Error('x'))
    const failed = renderCalendar()
    await screen.findByRole('button', { name: 'Retry' })
    await expectNoA11yViolations(failed.container)
  })
})
