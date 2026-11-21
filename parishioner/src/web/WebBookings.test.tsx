import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { WebBookings } from './WebBookings'
import { setViewport } from '../test/viewport'
import { fetchBooking, fetchBookings } from '../lib/data/bookings'
import { useAuthStore } from '../stores/auth-store'
import { HOLD_EXPIRED_NOTE, SACRAMENT_LABEL, STATUS_LABEL } from '../lib/domain'
import { scheduleText } from '../features/booking/BookingHistoryScreen'
import type { Booking } from '../lib/types'
import { expectNoA11yViolations } from '../test/a11y'

vi.mock('../lib/data/bookings', () => ({ fetchBookings: vi.fn(), fetchBooking: vi.fn(async (id: string) => ({ id })) }))
vi.mock('../lib/data/notifications', () => ({ fetchNotifications: vi.fn(async () => []) }))
vi.mock('../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter the Apostle Parish', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

function booking(overrides: Partial<Booking>): Booking {
  return {
    id: crypto.randomUUID(), referenceNumber: 'FUNE-20261102-AB12', userId: 'u1', sacrament: 'funeral',
    status: 'submitted', statusLabel: 'Awaiting review', formData: {}, appointmentDate: '2030-01-08',
    appointmentStart: '10:00', appointmentEnd: '11:00', isEmergency: false, paymentStatus: 'not_required',
    amountDueCentavos: 0, paymentHoldExpiresAt: null, paidAt: null, paymentReference: null, refundReference: null,
    refundedAt: null, statusReason: null, returnNote: null, createdAt: '2026-11-02T00:00:00Z', ...overrides,
  }
}

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

function renderPage(entry = '/booking/history') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <WebBookings />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const returned = booking({ id: 'r1', referenceNumber: 'RET-1', sacrament: 'wedding', status: 'returned', statusLabel: 'Needs changes' })
const upcoming = booking({ id: 'a1', referenceNumber: 'UP-1', sacrament: 'baptism', status: 'approved', statusLabel: 'Approved' })

describe('WebBookings', () => {
  beforeEach(() => {
    setViewport(1280)
    useAuthStore.setState({ user: { id: 'u1', fullName: 'Rita', email: 'r@x.org', phone: '', address: '' } as never, isBootstrapping: false } as never)
    vi.mocked(fetchBookings).mockReset().mockResolvedValue([upcoming, returned])
    vi.mocked(fetchBooking).mockReset().mockImplementation(async (id: string) => ({ id }) as never)
  })

  it('lists bookings in groups and selects the first needing attention', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'My bookings', level: 1 })).toBeInTheDocument()
    const list = await screen.findByRole('navigation', { name: 'Bookings' })
    expect(within(list).getByRole('heading', { name: 'Needs you' })).toBeInTheDocument()
    expect(within(list).getByRole('heading', { name: 'Upcoming' })).toBeInTheDocument()
    const pane = screen.getByRole('region', { name: 'Booking details' })
    expect(within(pane).getByRole('heading', { name: SACRAMENT_LABEL.wedding })).toBeInTheDocument()
    expect(within(pane).getByText(STATUS_LABEL.returned)).toBeInTheDocument()
    expect(within(pane).getByText('RET-1')).toBeInTheDocument()
    expect(within(pane).getByText(scheduleText(returned))).toBeInTheDocument()
    expect(within(pane).getByText('The parish asked for changes')).toBeInTheDocument()
    expect(within(pane).getByRole('link', { name: 'View full booking' })).toHaveAttribute('href', '/booking/history/r1')
    expect(fetchBookings).toHaveBeenCalledWith('u1')
    expect(vi.mocked(fetchBookings).mock.calls.every(([id]) => id === 'u1')).toBe(true)
  })

  it('shows each row as a link with its status and why it needs you, and marks the selected one', async () => {
    renderPage()
    const list = await screen.findByRole('navigation', { name: 'Bookings' })
    const row = within(list).getByRole('link', { name: /RET-1/ })
    expect(row).toHaveAttribute('href', '/booking/history?selected=r1')
    expect(row).toHaveAttribute('aria-current', 'true')
    expect(row).toHaveTextContent('The parish asked for changes')
    expect(row).toHaveTextContent(STATUS_LABEL.returned)
    expect(within(list).getByRole('link', { name: /UP-1/ })).not.toHaveAttribute('aria-current')
    expect(within(list).getAllByRole('list')).toHaveLength(2)
  })

  it('shows a busy skeleton shaped like the list and the pane while loading', () => {
    vi.mocked(fetchBookings).mockReturnValue(new Promise(() => {}))
    renderPage()
    const label = screen.getByText('Loading your bookings')
    expect(label.className).toMatch(/sr-only/)
    const busy = label.closest('[aria-busy]')!
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(3)
  })

  it('has no accessibility violations with bookings, with none, and when loading fails', async () => {
    const full = renderPage()
    await screen.findByRole('navigation', { name: 'Bookings' })
    await expectNoA11yViolations(full.container)
    full.unmount()
    vi.mocked(fetchBookings).mockResolvedValue([])
    const empty = renderPage()
    await screen.findByRole('link', { name: 'Book a sacrament' })
    await expectNoA11yViolations(empty.container)
    empty.unmount()
    vi.mocked(fetchBookings).mockRejectedValue(new Error('x'))
    const failed = renderPage()
    await screen.findByRole('button', { name: 'Retry' })
    await expectNoA11yViolations(failed.container)
  })

  it('selects another booking on click and records it in the address', async () => {
    renderPage()
    const list = await screen.findByRole('navigation', { name: 'Bookings' })
    await userEvent.click(within(list).getByRole('link', { name: /UP-1/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('?selected=a1')
    const pane = screen.getByRole('region', { name: 'Booking details' })
    expect(within(pane).getByText('UP-1')).toBeInTheDocument()
    expect(within(pane).getByRole('link', { name: 'View full booking' })).toHaveAttribute('href', '/booking/history/a1')
  })

  it('falls back to the default for an unknown selection and honours a known one', async () => {
    const first = renderPage('/booking/history?selected=nope')
    const pane = await screen.findByRole('region', { name: 'Booking details' })
    expect(within(pane).getByText('RET-1')).toBeInTheDocument()
    first.unmount()
    renderPage('/booking/history?selected=a1')
    expect(within(await screen.findByRole('region', { name: 'Booking details' })).getByText('UP-1')).toBeInTheDocument()
  })

  it('shows the expired-hold note and no action sentence for a lapsed unpaid booking', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([booking({ id: 'l1', referenceNumber: 'LAPSED-1', sacrament: 'wedding', paymentStatus: 'unpaid', paymentHoldExpiresAt: '2020-01-01T00:00:00Z' })])
    renderPage()
    const pane = await screen.findByRole('region', { name: 'Booking details' })
    expect(within(pane).getByText(HOLD_EXPIRED_NOTE)).toBeInTheDocument()
    expect(within(pane).queryByText(/pay with gcash/i)).not.toBeInTheDocument()
  })

  it('shows an empty state with a way to book', async () => {
    vi.mocked(fetchBookings).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('You have no bookings yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Book a sacrament' })).toHaveAttribute('href', '/services')
  })

  it('shows an error with Retry', async () => {
    vi.mocked(fetchBookings).mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText(/Couldn't load your bookings\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(fetchBookings).toHaveBeenCalledTimes(2)
  })

  it('asks for the full booking of the selected item only', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Wedding' })).toBeInTheDocument()
    expect(vi.mocked(fetchBooking).mock.calls.length).toBeGreaterThan(0)
    expect(vi.mocked(fetchBooking).mock.calls.every(([id]) => id === 'r1')).toBe(true)
  })

  it('shows a line when the day pass and checklist cannot load, and keeps the summary', async () => {
    vi.mocked(fetchBooking).mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText("Couldn't load the day pass and checklist.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View full booking' })).toBeInTheDocument()
  })

  it('shows the journey rail on the left of the detail pane, with the reference, and the details on the right', async () => {
    renderPage()
    const pane = await screen.findByRole('region', { name: 'Booking details' })
    const rail = within(pane).getByRole('list', { name: 'Booking progress' })
    const review = within(rail).getByText('Under review').closest('li')!
    expect(review).toHaveAttribute('aria-current', 'step')
    expect(within(review).getByText('Changes requested')).toBeInTheDocument()
    const left = pane.querySelector('[data-column="journey"]')!
    const right = pane.querySelector('[data-column="details"]')!
    expect(left).toContainElement(rail)
    expect(left).toContainElement(within(pane).getByText('RET-1'))
    expect(right).toContainElement(within(pane).getByText('The parish asked for changes'))
    expect(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(pane).getByText('RET-1').className).toMatch(/select-all/)
    await expectNoA11yViolations(pane)
  })

  describe('the day pass and checklist pane', () => {
    const m = { key: 'submitted', label: 'Booking submitted', done: true, state: 'done' as const, source: 'auto' as const, dueDate: null, gating: false, manual: false, note: null, doneAt: null, data: null }
    const fullWedding = {
      ...returned, status: 'approved', statusLabel: 'Approved', milestones: [m, { ...m, key: 'approved', label: 'Booking approved' }],
      dayPass: { url: 'https://x/y', qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }, checkedInAt: null,
    }

    it('shows the day pass and the preparation checklist from the full booking', async () => {
      vi.mocked(fetchBooking).mockResolvedValue(fullWedding as never)
      renderPage()
      const pane = await screen.findByRole('region', { name: 'Booking details' })
      expect(await within(pane).findByRole('heading', { name: 'Day pass' })).toBeInTheDocument()
      expect(within(pane).getByRole('heading', { name: 'Wedding preparation' })).toBeInTheDocument()
    })

    it('shows a loading line while the full booking is pending, then removes it', async () => {
      let resolve!: (b: never) => void
      vi.mocked(fetchBooking).mockReturnValue(new Promise((r) => { resolve = r as never }) as never)
      renderPage()
      const pane = await screen.findByRole('region', { name: 'Booking details' })
      expect(await within(pane).findByText('Loading…')).toBeInTheDocument()
      resolve(fullWedding as never)
      expect(await within(pane).findByRole('heading', { name: 'Day pass' })).toBeInTheDocument()
      expect(within(pane).queryByText('Loading…')).not.toBeInTheDocument()
    })
  })
})
