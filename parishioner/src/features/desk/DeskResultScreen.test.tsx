import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DeskResultScreen } from './DeskResultScreen'
import { useDeskStore } from '../../stores/desk-store'
import { useBookingStore } from '../../stores/booking-store'
import type { DeskBooking } from '../../lib/types'

const fetchDeskBooking = vi.fn()
const createPaymentLink = vi.fn()
const markCashReceived = vi.fn()
vi.mock('../../lib/data/walkIns', () => ({
  fetchDeskBooking: (...a: unknown[]) => fetchDeskBooking(...a),
  createPaymentLink: (...a: unknown[]) => createPaymentLink(...a),
  markCashReceived: (...a: unknown[]) => markCashReceived(...a),
}))

const contact = { fullName: 'Aling Rosa Dela Cruz', email: null, phone: '09171234567' }
const booking = (over: Partial<DeskBooking> = {}): DeskBooking => ({
  id: 'w1', referenceNumber: 'WEDD-20261102-AB12', userId: null, sacrament: 'wedding', status: 'submitted', statusLabel: 'Awaiting review',
  formData: {}, appointmentDate: '2027-03-03', appointmentStart: '10:00', appointmentEnd: '11:30', isEmergency: false,
  paymentStatus: 'unpaid', amountDueCentavos: 500000, paymentHoldExpiresAt: '2026-11-04T02:00:00Z', paidAt: null, paymentReference: null,
  refundReference: null, refundedAt: null, statusReason: null, returnNote: null, createdAt: '2026-11-02T00:00:00Z',
  channel: 'walk_in', user: contact, walkInContact: { ...contact, relationship: 'self' }, createdBy: { id: 's1', fullName: 'Staff User' }, ...over,
})

function renderResult() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/desk/result/w1']}>
        <Routes>
          <Route path="/desk/result/:id" element={<DeskResultScreen />} />
          <Route path="/desk" element={<p>Desk home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DeskResultScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDeskStore.getState().setDraftId('w1')
    useBookingStore.getState().startBooking('wedding')
  })

  it('shows the reference, the amount, the GCash QR code and the link when a fee is due', async () => {
    fetchDeskBooking.mockResolvedValue(booking())
    createPaymentLink.mockResolvedValue({ checkoutUrl: 'https://pay.paymongo.test/cs_w1', checkoutSessionId: 'cs_w1' })
    renderResult()

    expect(await screen.findByText('WEDD-20261102-AB12')).toBeInTheDocument()
    expect(screen.getByText(/aling rosa dela cruz/i)).toBeInTheDocument()
    expect(screen.getByText('₱5,000.00')).toBeInTheDocument()

    const qr = await screen.findByRole('img', { name: /gcash payment qr code/i })
    expect(qr.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('link', { name: /open gcash payment link/i })).toHaveAttribute('href', 'https://pay.paymongo.test/cs_w1')
    expect(createPaymentLink).toHaveBeenCalledWith('w1')
  })

  it('names the walk-in contact, not the linked account', async () => {
    fetchDeskBooking.mockResolvedValue(
      booking({ userId: 'acct-1', user: { fullName: 'Maria Santos', email: 'maria@example.com', phone: null }, paymentStatus: 'not_required', amountDueCentavos: 0 }),
    )
    renderResult()
    expect(await screen.findByText(/aling rosa dela cruz/i)).toBeInTheDocument()
    expect(screen.queryByText(/maria santos/i)).not.toBeInTheDocument()
  })

  it('explains a payment link that could not be made, and can try again', async () => {
    fetchDeskBooking.mockResolvedValue(booking())
    createPaymentLink
      .mockRejectedValueOnce(new Error('GCash payments are not available right now. Please try again later.'))
      .mockResolvedValueOnce({ checkoutUrl: 'https://pay.paymongo.test/cs_w1', checkoutSessionId: 'cs_w1' })
    renderResult()

    expect(await screen.findByText(/gcash payments are not available right now/i)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /gcash payment qr code/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('img', { name: /gcash payment qr code/i })).toBeInTheDocument()
  })

  it('says the booking is already paid when the server answers 409, with no QR code', async () => {
    fetchDeskBooking.mockResolvedValue(booking())
    createPaymentLink.mockResolvedValue(null)
    renderResult()
    expect(await screen.findByText(/already been paid/i)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /gcash payment qr code/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })

  it('shows no QR code when nothing is owed', async () => {
    fetchDeskBooking.mockResolvedValue(booking({ sacrament: 'funeral', paymentStatus: 'not_required', amountDueCentavos: 0, paymentHoldExpiresAt: null }))
    renderResult()
    expect(await screen.findByText(/no payment is due/i)).toBeInTheDocument()
    expect(createPaymentLink).not.toHaveBeenCalled()
    expect(screen.queryByRole('img', { name: /gcash payment qr code/i })).not.toBeInTheDocument()
  })

  it('starts the next walk-in clean', async () => {
    fetchDeskBooking.mockResolvedValue(booking({ paymentStatus: 'not_required', amountDueCentavos: 0 }))
    renderResult()
    await userEvent.click(await screen.findByRole('button', { name: /new walk-in booking/i }))
    expect(await screen.findByText('Desk home')).toBeInTheDocument()
    expect(useDeskStore.getState().draftId).toBeNull()
    expect(useBookingStore.getState().sacrament).toBeNull()
  })

  it('lets the counter take cash instead of GCash: marks it paid with an optional receipt number', async () => {
    fetchDeskBooking.mockResolvedValueOnce(booking()).mockResolvedValue(booking({ paymentStatus: 'paid' }))
    createPaymentLink.mockResolvedValue({ checkoutUrl: 'https://pay.paymongo.test/cs_w1', checkoutSessionId: 'cs_w1' })
    markCashReceived.mockResolvedValue(booking({ paymentStatus: 'paid' }))
    renderResult()

    await userEvent.type(await screen.findByLabelText(/receipt number/i), 'OR-0042')
    await userEvent.click(screen.getByRole('button', { name: /cash received/i }))

    expect(markCashReceived).toHaveBeenCalledWith('w1', 'OR-0042')
    expect(await screen.findByText(/already been paid/i)).toBeInTheDocument()
  })
})
