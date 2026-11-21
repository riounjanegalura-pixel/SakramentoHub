import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { CalendarScreen } from './CalendarScreen'
import { useAuthStore } from '../../stores/auth-store'
import { fetchBookings } from '../../lib/data/bookings'
import { fetchUpcomingEvents } from '../../lib/data/events'
import { expectNoA11yViolations } from '../../test/a11y'

vi.mock('../../lib/data/bookings', () => ({ fetchBookings: vi.fn() }))
vi.mock('../../lib/data/events', () => ({ fetchUpcomingEvents: vi.fn() }))

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

function renderCalendar(path = '/calendar?view=month') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <CalendarScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CalendarScreen on the phone', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0))
    vi.mocked(fetchBookings).mockReset().mockResolvedValue(BOOKINGS as never)
    vi.mocked(fetchUpcomingEvents).mockReset().mockResolvedValue(EVENTS as never)
    useAuthStore.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '' } as never })
  })
  afterEach(() => {
    vi.useRealTimers()
    useAuthStore.setState({ user: null })
  })

  describe('?date=', () => {
    it('opens on the day named, in its month', async () => {
      renderCalendar('/calendar?date=2026-12-03')
      expect(screen.getByRole('heading', { name: 'Schedule for Dec 3' })).toBeInTheDocument()
      expect(screen.getByText('December 2026')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Dec 3, 2026/ })).toHaveAttribute('aria-pressed', 'true')
      await screen.findByText('Nothing scheduled on this day.')
    })

    it('lists that day\'s events when it is a day with events', async () => {
      renderCalendar('/calendar?date=2026-11-08')
      const list = await screen.findByRole('list', { name: 'Schedule for Nov 8' })
      expect(within(list).getByText('Sunday Mass')).toBeInTheDocument()
      expect(within(list).getByRole('link', { name: /Wedding — Your Booking/ })).toHaveAttribute('href', '/booking/history/b1')
    })

    it.each(['nonsense', '2026-13-45', '2026-02-30', '1900-01-01', '9999-12-31', ''])('falls back to today for %j without throwing', (value) => {
      renderCalendar(`/calendar?date=${value}`)
      expect(screen.getByRole('heading', { name: 'Schedule for Today' })).toBeInTheDocument()
      expect(screen.getByText('November 2026')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Nov 5, 2026/ })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('selects today when nothing is chosen, and moves the selection with a tap', async () => {
    renderCalendar()
    const today = await screen.findByRole('button', { name: /^Nov 5, 2026/ })
    expect(today).toHaveAttribute('aria-pressed', 'true')
    expect(today).toHaveAttribute('aria-current', 'date')
    await userEvent.click(screen.getByRole('button', { name: /^Nov 8, 2026/ }))
    expect(screen.getByRole('heading', { name: 'Schedule for Nov 8' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Nov 8, 2026/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Nov 5, 2026/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('names each day by its date and how many items it has', async () => {
    renderCalendar()
    expect(await screen.findByRole('button', { name: 'Nov 8, 2026, 2 items' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nov 9, 2026' })).toBeInTheDocument()
  })

  it('names the month buttons and makes them 44 px targets', async () => {
    renderCalendar()
    for (const name of ['Previous month', 'Next month']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/size-11/)
    }
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('December 2026')).toBeInTheDocument()
  })

  it('shows the time of each item in tabular figures (mono is for reference numbers only)', async () => {
    renderCalendar()
    const time = await screen.findByText('5:30 PM')
    expect(time.className).toMatch(/tabular-nums/)
  })

  it('shows a busy skeleton in the shape of the schedule while loading', () => {
    vi.mocked(fetchUpcomingEvents).mockReturnValue(new Promise(() => {}))
    renderCalendar()
    const label = screen.getByText('Loading the schedule')
    expect(label.className).toMatch(/sr-only/)
    const busy = label.closest('[aria-busy]')!
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(1)
  })

  it('says what the day is for and offers one action when nothing is scheduled', async () => {
    vi.mocked(fetchUpcomingEvents).mockResolvedValue([])
    vi.mocked(fetchBookings).mockResolvedValue([])
    renderCalendar()
    expect(await screen.findByText('Nothing scheduled on this day.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Book a sacrament' })).toHaveAttribute('href', '/services')
  })

  it('offers Retry that asks again when the events cannot load', async () => {
    vi.mocked(fetchUpcomingEvents).mockRejectedValueOnce(new Error('boom'))
    renderCalendar()
    expect(await screen.findByText(/couldn.t load events/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Today Rosary')).toBeInTheDocument()
    expect(fetchUpcomingEvents).toHaveBeenCalledTimes(2)
  })

  it('has no accessibility violations loaded, empty, and failed', async () => {
    const full = renderCalendar()
    await screen.findByText('Today Rosary')
    await expectNoA11yViolations(full.container)
    full.unmount()
    vi.mocked(fetchUpcomingEvents).mockResolvedValue([])
    vi.mocked(fetchBookings).mockResolvedValue([])
    const empty = renderCalendar()
    await screen.findByText('Nothing scheduled on this day.')
    await expectNoA11yViolations(empty.container)
    empty.unmount()
    vi.mocked(fetchUpcomingEvents).mockRejectedValue(new Error('x'))
    const failed = renderCalendar()
    await screen.findByRole('button', { name: 'Retry' })
    await expectNoA11yViolations(failed.container)
  })
})

describe('CalendarScreen list view', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0))
    vi.mocked(fetchBookings).mockReset().mockResolvedValue(BOOKINGS as never)
    vi.mocked(fetchUpcomingEvents).mockReset().mockResolvedValue(EVENTS as never)
    useAuthStore.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '' } as never })
  })
  afterEach(() => {
    vi.useRealTimers()
    useAuthStore.setState({ user: null })
  })

  it('opens as a list grouped by week, with real time elements and no month grid', async () => {
    const { container } = renderCalendar('/calendar')
    expect(await screen.findByRole('heading', { name: 'This week' })).toBeInTheDocument()
    expect(container.querySelectorAll('time').length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByRole('button', { name: 'Previous month' })).not.toBeInTheDocument()
    await expectNoA11yViolations(container)
  })

  it('keeps events plain and links your own appointment to the booking', async () => {
    renderCalendar('/calendar')
    const own = await screen.findByRole('link', { name: /Wedding — Your Booking/ })
    expect(own).toHaveAttribute('href', '/booking/history/b1')
    expect(screen.getByText('Sunday Mass').closest('a')).toBeNull()
  })

  it('switches to the month grid and back, saying which view is pressed', async () => {
    renderCalendar('/calendar')
    await screen.findByRole('heading', { name: 'This week' })
    await userEvent.click(screen.getByRole('button', { name: 'Month' }))
    expect(screen.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(await screen.findByRole('heading', { name: 'This week' })).toBeInTheDocument()
  })
})
