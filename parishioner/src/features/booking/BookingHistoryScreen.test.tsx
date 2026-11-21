import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { BookingHistoryScreen, groupBookings } from './BookingHistoryScreen'
import { STATUS_LABEL, needsAction } from '../../lib/domain'
import { useAuthStore } from '../../stores/auth-store'
import { staggerDelay } from '../../lib/motion'
import { expectNoA11yViolations } from '../../test/a11y'
import type { Booking } from '../../lib/types'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motion.reduced,
}))
vi.mock('../../lib/motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/motion')>()
  return { ...actual, staggerDelay: vi.fn(actual.staggerDelay) }
})

function booking(overrides: Partial<Booking>): Booking {
  return {
    id: crypto.randomUUID(), referenceNumber: 'FUNE-20261102-AB12', userId: 'u1', sacrament: 'funeral',
    status: 'submitted', statusLabel: 'Awaiting review', formData: {}, appointmentDate: '2030-01-08',
    appointmentStart: '10:00', appointmentEnd: '11:00', isEmergency: false, paymentStatus: 'not_required',
    amountDueCentavos: 0, paymentHoldExpiresAt: null, paidAt: null, paymentReference: null, refundReference: null,
    refundedAt: null, statusReason: null, returnNote: null, createdAt: '2026-11-02T00:00:00Z', ...overrides,
  }
}

const fetchBookings = vi.fn()
vi.mock('../../lib/data/bookings', () => ({ fetchBookings: (...a: unknown[]) => fetchBookings(...a) }))

function renderScreen() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <BookingHistoryScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BookingHistoryScreen', () => {
  beforeEach(() => {
    useAuthStore.getState().setUser({ id: 'u1', fullName: 'A', email: 'a@x.com', phone: '', address: '' })
    motion.reduced = false
    fetchBookings.mockReset()
    vi.mocked(staggerDelay).mockClear()
  })

  it('groups bookings by what the parishioner should do next', async () => {
    fetchBookings.mockResolvedValue([
      booking({ referenceNumber: 'RET-1', status: 'returned', statusLabel: 'Needs changes', returnNote: 'Re-upload' }),
      booking({ referenceNumber: 'UNPAID-1', sacrament: 'wedding', paymentStatus: 'unpaid', paymentHoldExpiresAt: new Date(Date.now() + 3600_000).toISOString() }),
      booking({ referenceNumber: 'UP-1', status: 'approved', statusLabel: 'Approved' }),
      booking({ referenceNumber: 'PAST-1', status: 'declined', statusLabel: 'Declined' }),
    ])
    renderScreen()

    const attention = await screen.findByRole('region', { name: 'Needs you' })
    expect(within(attention).getByText('RET-1')).toBeInTheDocument()
    expect(within(attention).getByText('UNPAID-1')).toBeInTheDocument()
    expect(within(attention).getByText(/pay with gcash to keep your slot/i)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Upcoming' })).getByText('UP-1')).toBeInTheDocument()
    // No history list: a declined booking is not shown.
    expect(screen.queryByText('PAST-1')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Earlier' })).not.toBeInTheDocument()
  })

  it('makes each section a real list under an h2, and leaves empty sections out', async () => {
    fetchBookings.mockResolvedValue([
      booking({ referenceNumber: 'RET-1', status: 'returned' }),
      booking({ referenceNumber: 'UP-1', status: 'approved' }),
    ])
    renderScreen()
    await screen.findByText('RET-1')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Needs you', 'Upcoming'])
    const needs = screen.getByRole('region', { name: 'Needs you' })
    expect(within(needs).getByRole('list')).toBeInTheDocument()
    expect(within(needs).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByRole('region', { name: 'Earlier' })).not.toBeInTheDocument()
  })

  it('makes each row one link to the booking, with the sacrament, status and the reason it needs you', async () => {
    fetchBookings.mockResolvedValue([booking({ id: 'r1', referenceNumber: 'RET-1', sacrament: 'wedding', status: 'returned' })])
    renderScreen()
    const row = await screen.findByRole('link', { name: /wedding/i })
    expect(row).toHaveAttribute('href', '/booking/history/r1')
    expect(row).toHaveTextContent('The parish asked for changes')
    expect(row).toHaveTextContent(STATUS_LABEL.returned)
    expect(row.className).toMatch(/min-h-\[72px\]/)
  })

  it('shows the date and time in tabular figures', async () => {
    fetchBookings.mockResolvedValue([booking({ referenceNumber: 'UP-1', status: 'approved', appointmentDate: '2030-01-08', appointmentStart: '10:00' })])
    renderScreen()
    const when = await screen.findByText(/Jan 8, 2030 · 10:00 AM/)
    expect(when.className).toMatch(/tabular-nums/)
  })

  it('shows when a live payment hold ends, in tabular figures', async () => {
    const hold = new Date(Date.now() + 3 * 3600 * 1000).toISOString()
    fetchBookings.mockResolvedValue([booking({ referenceNumber: 'UNPAID-1', paymentStatus: 'unpaid', paymentHoldExpiresAt: hold })])
    renderScreen()
    const ends = await screen.findByText(/hold ends/i)
    expect(ends.className).toMatch(/tabular-nums/)
  })

  it('shows every row at once: no entry animation, with or without reduced motion', async () => {
    fetchBookings.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => booking({ referenceNumber: `UP-${i}`, status: 'approved', appointmentDate: `2030-02-${String(i + 10)}` })),
    )
    renderScreen()
    await screen.findByText('UP-9')
    for (const item of screen.getAllByRole('listitem')) expect(item).not.toHaveStyle({ opacity: '0' })
    expect(vi.mocked(staggerDelay)).not.toHaveBeenCalled()
  })

  it('draws ruled rows, not cards: a hairline between rows and no shadow', async () => {
    fetchBookings.mockResolvedValue([booking({ referenceNumber: 'UP-1', status: 'approved' }), booking({ id: 'b2', referenceNumber: 'UP-2', status: 'approved' })])
    renderScreen()
    await screen.findByText('UP-1')
    const list = screen.getAllByRole('list')[0]
    expect(list.className).toMatch(/divide-y/)
    expect(list.innerHTML).not.toMatch(/shadow-card|rounded-2xl/)
  })

  it('has a Documents and certificates row at the top, one tap from the bookings', async () => {
    fetchBookings.mockResolvedValue([])
    renderScreen()
    expect(await screen.findByRole('link', { name: /Documents and certificates/ })).toHaveAttribute('href', '/wallet')
  })

  it('shows a busy skeleton in the shape of the lists while loading', () => {
    fetchBookings.mockReturnValue(new Promise(() => {}))
    renderScreen()
    const label = screen.getByText('Loading your bookings')
    expect(label.className).toMatch(/sr-only/)
    const busy = label.closest('[aria-busy]')!
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(2)
  })

  it('shows an empty state with a way to book', async () => {
    fetchBookings.mockResolvedValue([])
    renderScreen()
    expect(await screen.findByText('You have no bookings yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /book a sacrament/i })).toHaveAttribute('href', '/services')
  })

  it('offers Retry that asks again when the bookings cannot load', async () => {
    fetchBookings.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([booking({ referenceNumber: 'UP-1', status: 'approved' })])
    renderScreen()
    expect(await screen.findByText(/couldn.t load your bookings/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('UP-1')).toBeInTheDocument()
    expect(fetchBookings).toHaveBeenCalledTimes(2)
  })

  it('has no accessibility violations with bookings, with none, and when loading fails', async () => {
    fetchBookings.mockResolvedValue([
      booking({ referenceNumber: 'RET-1', status: 'returned' }),
      booking({ referenceNumber: 'UP-1', status: 'approved' }),
      booking({ referenceNumber: 'DRAFT-1', status: 'draft' }),
    ])
    const full = renderScreen()
    await screen.findByText('DRAFT-1')
    await expectNoA11yViolations(full.container)
    full.unmount()
    fetchBookings.mockResolvedValue([])
    const empty = renderScreen()
    await screen.findByRole('link', { name: /book a sacrament/i })
    await expectNoA11yViolations(empty.container)
    empty.unmount()
    fetchBookings.mockRejectedValue(new Error('x'))
    const failed = renderScreen()
    await screen.findByRole('button', { name: 'Retry' })
    await expectNoA11yViolations(failed.container)
  })

  it('does not ask for payment once the hold has expired', async () => {
    fetchBookings.mockResolvedValue([
      booking({ referenceNumber: 'LAPSED-1', sacrament: 'wedding', paymentStatus: 'unpaid', paymentHoldExpiresAt: '2020-01-01T00:00:00Z' }),
    ])
    renderScreen()
    expect(await screen.findByText('LAPSED-1')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Needs you' })).not.toBeInTheDocument()
    expect(screen.queryByText(/pay with gcash to keep your slot/i)).not.toBeInTheDocument()
    expect(screen.getByText(/payment window closed — this booking will be cancelled/i)).toBeInTheDocument()
  })

  it('notices by itself when a payment hold runs out', async () => {
    fetchBookings.mockResolvedValue([
      booking({ referenceNumber: 'UNPAID-1', sacrament: 'wedding', paymentStatus: 'unpaid', paymentHoldExpiresAt: new Date(Date.now() + 1200).toISOString() }),
    ])
    renderScreen()
    expect(await screen.findByText(/pay with gcash to keep your slot/i)).toBeInTheDocument()

    expect(await screen.findByText(/payment window closed — this booking will be cancelled/i, {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.queryByText(/pay with gcash to keep your slot/i)).not.toBeInTheDocument()
    await waitFor(() => expect(fetchBookings).toHaveBeenCalledTimes(2))
  })
})

describe('needsAction', () => {
  it('asks for payment only while the hold is open', () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString()
    expect(needsAction(booking({ paymentStatus: 'unpaid', paymentHoldExpiresAt: future }))).toBe('Pay with GCash to keep your slot')
    expect(needsAction(booking({ paymentStatus: 'unpaid', paymentHoldExpiresAt: '2020-01-01T00:00:00Z' }))).toBeNull()
  })
})

describe('groupBookings', () => {
  const future = new Date(Date.now() + 3600 * 1000).toISOString()
  const titles = (list: Booking[]) => groupBookings(list).map((g) => g.title)
  const group = (list: Booking[], title: string) => groupBookings(list).find((g) => g.title === title)?.items.map((b) => b.referenceNumber)

  it('omits empty groups', () => {
    expect(groupBookings([])).toEqual([])
    expect(titles([booking({ status: 'draft' })])).toEqual(['Drafts'])
  })

  it('puts returned and live-hold unpaid bookings under Needs you, first', () => {
    const list = [
      booking({ referenceNumber: 'UP', status: 'approved', appointmentDate: '2030-07-01' }),
      booking({ referenceNumber: 'RET', status: 'returned' }),
      booking({ referenceNumber: 'LIVE', paymentStatus: 'unpaid', paymentHoldExpiresAt: future }),
    ]
    expect(group(list, 'Needs you')).toEqual(expect.arrayContaining(['RET', 'LIVE']))
    expect(titles(list)).toEqual(['Needs you', 'Upcoming'])
  })

  it('puts an expired-hold unpaid booking under Upcoming, drafts under Drafts and leaves finished ones out', () => {
    const list = [
      booking({ referenceNumber: 'LAPSED', paymentStatus: 'unpaid', paymentHoldExpiresAt: '2020-01-01T00:00:00Z', appointmentDate: '2030-07-01' }),
      booking({ referenceNumber: 'D', status: 'draft' }),
      booking({ referenceNumber: 'C', status: 'completed' }),
      booking({ referenceNumber: 'X', status: 'declined' }),
      booking({ referenceNumber: 'N', status: 'cancelled' }),
    ]
    expect(group(list, 'Upcoming')).toEqual(['LAPSED'])
    expect(group(list, 'Drafts')).toEqual(['D'])
    // Completed, declined and cancelled bookings are not listed: there is no history.
    expect(titles(list)).toEqual(['Upcoming', 'Drafts'])
  })

  it('keeps an approved or paid booking whose date has passed under Upcoming, until the office completes it', () => {
    const list = [
      booking({ referenceNumber: 'GONE', status: 'approved', appointmentDate: '2030-06-14' }),
      booking({ referenceNumber: 'TODAY', status: 'approved', appointmentDate: '2030-06-15' }),
      booking({ referenceNumber: 'PAID-GONE', status: 'submitted', paymentStatus: 'paid', appointmentDate: '2030-01-01' }),
      booking({ referenceNumber: 'PAID', status: 'submitted', paymentStatus: 'paid', appointmentDate: '2030-06-20' }),
    ]
    expect(group(list, 'Upcoming')).toEqual(['PAID-GONE', 'GONE', 'TODAY', 'PAID'])
  })

  it('sorts Upcoming by appointment date ascending', () => {
    const list = [
      booking({ referenceNumber: 'LATE', appointmentDate: '2030-09-01' }),
      booking({ referenceNumber: 'EARLY', appointmentDate: '2030-07-01' }),
      booking({ referenceNumber: 'MID', status: 'approved', appointmentDate: '2030-08-01' }),
      booking({ referenceNumber: 'OLD', status: 'completed', appointmentDate: '2030-01-01' }),
      booking({ referenceNumber: 'NEWER', status: 'completed', appointmentDate: '2030-03-01' }),
    ]
    expect(group(list, 'Upcoming')).toEqual(['EARLY', 'MID', 'LATE'])
  })
})
