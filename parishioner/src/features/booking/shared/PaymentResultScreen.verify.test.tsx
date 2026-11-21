import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { PaymentResultScreen } from './PaymentResultScreen'
import { seedBooking } from '../../../test/seed'
import * as bookings from '../../../lib/data/bookings'
import * as parish from '../../../lib/data/parish'

// DEMO_PAYMENT_OTP: after PayMongo confirms the payment, the payer verifies a mobile number with an SMS code.

function renderResult(bookingId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/payment/success?bookingId=${bookingId}`]}>
        <PaymentResultScreen outcome="success" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function parishWith(demoPaymentOtp: boolean) {
  const info = await vi.importActual<typeof import('../../../lib/mock/parish')>('../../../lib/mock/parish')
  vi.spyOn(parish, 'fetchParishInfo').mockResolvedValue({ ...(await info.fetchParishInfo()), demoPaymentOtp })
}

describe('PaymentResultScreen with the demo number check', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('asks for a code after a paid payment, and shows "Payment received" once it is verified', async () => {
    await parishWith(true)
    const booking = seedBooking({ status: 'submitted', paymentStatus: 'paid', amountDueCentavos: 500000 })
    vi.spyOn(bookings, 'sendSimulatedCode').mockResolvedValue({ channel: 'sms', to: '0917***567', expiresInSeconds: 300 })
    const verify = vi.spyOn(bookings, 'confirmSimulatedPayment').mockResolvedValue(booking)
    renderResult(booking.id)

    expect(await screen.findByRole('heading', { name: /verify your number/i })).toBeInTheDocument()
    expect(screen.queryByText(/payment received/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: '09171234567' } })
    fireEvent.click(screen.getByRole('button', { name: /send code/i }))
    expect(await screen.findByText(/texted a code to/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '482913' } })
    fireEvent.click(screen.getByRole('button', { name: /^verify$/i }))

    expect(await screen.findByRole('heading', { name: /payment received/i })).toBeInTheDocument()
    expect(verify).toHaveBeenCalledWith(booking.id, '482913')
  })

  it('goes straight to "Payment received" when the demo is off', async () => {
    await parishWith(false)
    const booking = seedBooking({ status: 'submitted', paymentStatus: 'paid', amountDueCentavos: 500000 })
    renderResult(booking.id)

    expect(await screen.findByRole('heading', { name: /payment received/i })).toBeInTheDocument()
    expect(screen.queryByText(/verify your number/i)).not.toBeInTheDocument()
  })
})
