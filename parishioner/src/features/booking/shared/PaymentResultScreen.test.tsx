import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { PaymentResultScreen } from './PaymentResultScreen'
import * as bookingsDataLayer from '../../../lib/data/bookings'
import type { Booking } from '../../../lib/types'
import { useAuthStore } from '../../../stores/auth-store'
import { setViewport } from '../../../test/viewport'
import { expectNoA11yViolations } from '../../../test/a11y'

const originalMatchMedia = window.matchMedia

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    userId: 'user-1',
    sacrament: 'wedding',
    status: 'submitted',
    formData: {},
    referenceNumber: 'BAPT-20260101-AAAA',
    statusLabel: 'Awaiting review',
    appointmentDate: null,
    appointmentStart: null,
    appointmentEnd: null,
    isEmergency: false,
    paymentHoldExpiresAt: null,
    paymentReference: null,
    refundReference: null,
    refundedAt: null,
    statusReason: null,
    returnNote: null,
    paymentStatus: 'unpaid',
    amountDueCentavos: 500000,
    paidAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function renderAt(outcome: 'success' | 'cancelled') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/payment/${outcome}?bookingId=b1`]}>
        <PaymentResultScreen outcome={outcome} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PaymentResultScreen', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    window.matchMedia = originalMatchMedia
    useAuthStore.setState({ user: null })
    vi.restoreAllMocks()
  })

  it.each([[1280, true], [390, false]])('at %i px the website frame is %s', async (width, framed) => {
    setViewport(width)
    useAuthStore.setState({ user: { id: 'user-1', fullName: 'Rio', email: 'r@x.com', phone: '', address: '' } })
    vi.spyOn(bookingsDataLayer, 'fetchBooking').mockResolvedValue(makeBooking())
    renderAt('cancelled')
    await screen.findByText(/payment not completed/i)
    if (framed) expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    else expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(!!document.querySelector('[data-app-shell]')).toBe(!framed)
  })

  it('does not trust the success redirect alone: shows "confirming" until the webhook marks it paid', async () => {
    vi.spyOn(bookingsDataLayer, 'fetchBooking').mockResolvedValue(makeBooking({ paymentStatus: 'unpaid' }))

    renderAt('success')

    expect(await screen.findByText(/confirming your payment/i)).toBeInTheDocument()
    expect(screen.queryByText(/payment received/i)).not.toBeInTheDocument()
  })

  it('re-fetches the booking and shows the confirmed payment once PayMongo has confirmed it', async () => {
    vi.spyOn(bookingsDataLayer, 'fetchBooking')
      .mockResolvedValueOnce(makeBooking({ paymentStatus: 'unpaid' }))
      .mockResolvedValue(makeBooking({ paymentStatus: 'paid', paidAt: new Date().toISOString() }))

    renderAt('success')

    expect(await screen.findByText(/payment received/i, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText(/₱5000\.00/)).toBeInTheDocument()
  })

  it('has no accessibility violations while confirming (the gold clock is not gold text)', async () => {
    vi.spyOn(bookingsDataLayer, 'fetchBooking').mockResolvedValue(makeBooking({ paymentStatus: 'unpaid' }))
    const { container } = renderAt('success')
    await screen.findByText(/confirming your payment/i)
    expect(container.querySelector('.text-brand-gold')).toBeNull()
    await expectNoA11yViolations(container)
  })

  it('on cancel, explains the booking is saved but unpaid and offers to try again', async () => {
    vi.spyOn(bookingsDataLayer, 'fetchBooking').mockResolvedValue(makeBooking())

    renderAt('cancelled')

    expect(await screen.findByText(/payment not completed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText(/pay later/i)).not.toBeInTheDocument()
  })
})
