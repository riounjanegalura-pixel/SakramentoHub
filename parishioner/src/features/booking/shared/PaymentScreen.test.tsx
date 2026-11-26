import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom'
import { PaymentScreen } from './PaymentScreen'
import { useBookingStore } from '../../../stores/booking-store'
import { useAuthStore } from '../../../stores/auth-store'
import { seedBooking } from '../../../test/seed'
import * as bookingsDataLayer from '../../../lib/data/bookings'
import { redirectTo } from '../../../lib/redirect'
import { setViewport } from '../../../test/viewport'
import { formatInstant } from '../../../lib/domain'
import { expectNoA11yViolations } from '../../../test/a11y'

vi.mock('../../../lib/redirect', () => ({ redirectTo: vi.fn() }))

function renderWithProviders(initialPath = '/booking/wedding/payment') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <PaymentScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function submittedWedding() {
  return seedBooking({ status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 500000 })
}

const originalMatchMedia = window.matchMedia

describe('PaymentScreen (PayMongo GCash checkout)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(redirectTo).mockReset()
    useAuthStore.setState({
      user: { id: 'user-1', fullName: 'Rio', email: 'r@x.com', phone: '', address: '' },
    })
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    useBookingStore.getState().reset()
    vi.restoreAllMocks()
  })

  it('shows the server-computed amount and both ways to pay, with no placeholder QR or receipt upload', async () => {
    const booking = submittedWedding()
    useBookingStore.setState({ sacrament: 'wedding', bookingId: booking.id })

    renderWithProviders()

    expect(await screen.findByRole('button', { name: /pay ₱5,000.00 with gcash/i }, { timeout: 3000 })).toBeEnabled()
    expect(screen.queryByText(/pay later/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay at the parish office' })).toBeEnabled()
    expect(screen.queryByRole('img', { name: /qr/i })).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('has no accessibility violations and no gold text on the amount', async () => {
    const booking = submittedWedding()
    useBookingStore.setState({ sacrament: 'wedding', bookingId: booking.id })
    const { container } = renderWithProviders()
    await screen.findByRole('button', { name: /pay ₱5,000.00 with gcash/i }, { timeout: 3000 })
    expect(container.querySelector('.text-brand-gold')).toBeNull()
    await expectNoA11yViolations(container)
  })

  it.each([[1280, true], [390, false]])('at %i px the website frame is %s', async (width, framed) => {
    setViewport(width)
    const booking = submittedWedding()
    useBookingStore.setState({ sacrament: 'wedding', bookingId: booking.id })
    renderWithProviders()
    await screen.findByRole('button', { name: /pay ₱5,000.00 with gcash/i }, { timeout: 3000 })
    expect(!!screen.queryByRole('navigation', { name: 'Main' })).toBe(framed)
    expect(!!document.querySelector('[data-app-shell]')).toBe(!framed)
  })

  it('starts a PayMongo checkout for the booking and redirects the browser to it', async () => {
    const booking = submittedWedding()
    useBookingStore.setState({ sacrament: 'wedding', bookingId: booking.id })
    const initiate = vi.spyOn(bookingsDataLayer, 'initiatePayment').mockResolvedValue({
      checkoutUrl: 'https://checkout.paymongo.com/cs_test_123',
      checkoutSessionId: 'cs_test_123',
    })

    renderWithProviders()
    fireEvent.click(await screen.findByRole('button', { name: /with gcash/i }, { timeout: 3000 }))

    await waitFor(() => expect(redirectTo).toHaveBeenCalledWith('https://checkout.paymongo.com/cs_test_123'))
    expect(initiate).toHaveBeenCalledWith(booking.id)
  })

  it('shows the backend error and does not redirect when checkout cannot be started', async () => {
    const booking = submittedWedding()
    useBookingStore.setState({ sacrament: 'wedding', bookingId: booking.id })
    vi.spyOn(bookingsDataLayer, 'initiatePayment').mockRejectedValue(
      new Error('GCash payments are not available right now. Please try again later.'),
    )

    renderWithProviders()
    fireEvent.click(await screen.findByRole('button', { name: /with gcash/i }, { timeout: 3000 }))

    expect(await screen.findByText(/not available right now/i)).toBeInTheDocument()
    expect(redirectTo).not.toHaveBeenCalled()
  })

  it('reads the booking id from ?bookingId= when resuming payment from Booking History', async () => {
    const booking = submittedWedding()

    renderWithProviders(`/booking/wedding/payment?bookingId=${booking.id}`)

    expect(await screen.findByRole('button', { name: /with gcash/i }, { timeout: 3000 })).toBeInTheDocument()
  })

  it('does not offer to pay again for an already-paid booking', async () => {
    const booking = seedBooking({ status: 'submitted', paymentStatus: 'paid', amountDueCentavos: 500000 })
    useBookingStore.setState({ sacrament: 'wedding', bookingId: booking.id })

    renderWithProviders()

    expect(await screen.findByText(/already been paid/i, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /with gcash/i })).not.toBeInTheDocument()
  })
})

describe('PaymentScreen (cash at the parish office)', () => {
  const inTwoDays = () => new Date(Date.now() + 48 * 3600 * 1000).toISOString()

  beforeEach(() => {
    localStorage.clear()
    vi.mocked(redirectTo).mockReset()
    useAuthStore.setState({
      user: { id: 'user-1', fullName: 'Rio', email: 'r@x.com', phone: '', address: '' },
    })
  })

  afterEach(() => {
    useBookingStore.getState().reset()
    vi.restoreAllMocks()
  })

  it('choosing cash keeps the hold and says what to bring, where and by when, never that it is paid', async () => {
    const hold = inTwoDays()
    const booking = seedBooking({ status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 500000, paymentHoldExpiresAt: hold, referenceNumber: 'WED-20261212-ABCD' })
    useBookingStore.setState({ sacrament: 'wedding', bookingId: booking.id })
    const choose = vi.spyOn(bookingsDataLayer, 'chooseCashPayment')

    renderWithProviders()
    fireEvent.click(await screen.findByRole('button', { name: 'Pay at the parish office' }, { timeout: 3000 }))

    expect(await screen.findByText('You chose to pay at the parish office.')).toBeInTheDocument()
    expect(choose).toHaveBeenCalledWith(booking.id)
    expect(screen.getByText(/not paid yet/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What to bring' })).toBeInTheDocument()
    expect(screen.getByText('WED-20261212-ABCD')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Where' })).toBeInTheDocument()
    expect(await screen.findByText('Balagtas, Bulacan')).toBeInTheDocument()
    expect(screen.getByText(/office hours: Tuesday to Saturday, 8:00 AM to 5:00 PM/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'By when' })).toBeInTheDocument()
    expect(screen.getByText(formatInstant(hold))).toBeInTheDocument()
    expect(screen.queryByText(/payment successful/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/already been paid/i)).not.toBeInTheDocument()
    expect(redirectTo).not.toHaveBeenCalled()
  })

  it('a booking already waiting for cash shows the instructions, can switch to GCash, and has no accessibility violations', async () => {
    const booking = seedBooking({ status: 'submitted', paymentStatus: 'pending_cash', paymentMethod: 'cash', amountDueCentavos: 500000, paymentHoldExpiresAt: inTwoDays() })
    vi.spyOn(bookingsDataLayer, 'initiatePayment').mockResolvedValue({ checkoutUrl: 'https://checkout.paymongo.com/cs_x', checkoutSessionId: 'cs_x' })

    const { container } = renderWithProviders(`/booking/wedding/payment?bookingId=${booking.id}`)
    expect(await screen.findByRole('heading', { name: 'What to bring' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pay at the parish office' })).not.toBeInTheDocument()
    await expectNoA11yViolations(container)

    fireEvent.click(screen.getByRole('button', { name: 'Pay with GCash instead' }))
    await waitFor(() => expect(redirectTo).toHaveBeenCalledWith('https://checkout.paymongo.com/cs_x'))
  })

  it('shows the server refusal when cash cannot be chosen', async () => {
    const booking = seedBooking({ status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 500000, paymentHoldExpiresAt: inTwoDays() })
    useBookingStore.setState({ sacrament: 'wedding', bookingId: booking.id })
    vi.spyOn(bookingsDataLayer, 'chooseCashPayment').mockRejectedValue(
      new Error('The payment window for this booking has closed, so its time is no longer held. Please make a new booking.'),
    )

    renderWithProviders()
    fireEvent.click(await screen.findByRole('button', { name: 'Pay at the parish office' }, { timeout: 3000 }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/payment window for this booking has closed/i)
    expect(screen.queryByText('You chose to pay at the parish office.')).not.toBeInTheDocument()
  })

  it('a returned booking can still pay by GCash but is not offered cash at the office (the server refuses it)', async () => {
    const booking = seedBooking({ status: 'returned', paymentStatus: 'unpaid', amountDueCentavos: 500000, paymentHoldExpiresAt: null })

    renderWithProviders(`/booking/wedding/payment?bookingId=${booking.id}`)

    expect(await screen.findByRole('button', { name: /pay ₱5,000.00 with gcash/i }, { timeout: 3000 })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Pay at the parish office' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /pay in cash at the parish office/i })).not.toBeInTheDocument()
  })

  it('a cash booking whose hold ran out says so and offers no way to pay', async () => {
    const booking = seedBooking({ status: 'submitted', paymentStatus: 'pending_cash', paymentMethod: 'cash', amountDueCentavos: 500000, paymentHoldExpiresAt: new Date(Date.now() - 60_000).toISOString() })

    renderWithProviders(`/booking/wedding/payment?bookingId=${booking.id}`)

    expect(await screen.findByText(/payment window closed/i, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /gcash/i })).not.toBeInTheDocument()
  })
})
