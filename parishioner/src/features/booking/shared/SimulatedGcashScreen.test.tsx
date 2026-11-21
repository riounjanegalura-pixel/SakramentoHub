import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { SimulatedGcashScreen } from './SimulatedGcashScreen'
import { seedBooking } from '../../../test/seed'
import * as bookings from '../../../lib/data/bookings'

function Where() {
  const loc = useLocation()
  return <p data-testid="where">{loc.pathname}{loc.search}</p>
}

function renderScreen(bookingId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/payment/simulated?bookingId=${bookingId}`]}>
        <Routes>
          <Route path="/payment/simulated" element={<SimulatedGcashScreen />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SimulatedGcashScreen (demo payment)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('says it is a demo, shows the fee, and asks for a mobile number first', async () => {
    const booking = seedBooking({ status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 500000 })
    renderScreen(booking.id)

    expect(screen.getByText(/no money moves/i)).toBeInTheDocument()
    expect(await screen.findByText('₱5,000.00')).toBeInTheDocument()
    expect(screen.getByLabelText(/mobile number/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/6-digit code/i)).not.toBeInTheDocument()
  })

  it('refuses a mobile number that is not 09 and 11 digits without calling the server', async () => {
    const send = vi.spyOn(bookings, 'sendSimulatedCode')
    const booking = seedBooking({ status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 500000 })
    renderScreen(booking.id)

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: '12345' } })
    fireEvent.click(screen.getByRole('button', { name: /send code/i }))

    expect(await screen.findByText(/11-digit mobile number/i)).toBeInTheDocument()
    expect(send).not.toHaveBeenCalled()
  })

  it('sends the code, then a correct code pays and goes to the payment result page', async () => {
    const booking = seedBooking({ status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 500000 })
    vi.spyOn(bookings, 'sendSimulatedCode').mockResolvedValue({ channel: 'sms', to: '0917***567', expiresInSeconds: 300 })
    const confirm = vi.spyOn(bookings, 'confirmSimulatedPayment').mockResolvedValue({ ...booking, paymentStatus: 'paid' })
    renderScreen(booking.id)
    await screen.findByText('₱5,000.00')

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: '09171234567' } })
    fireEvent.click(screen.getByRole('button', { name: /send code/i }))

    expect(await screen.findByText(/texted a code to/i)).toBeInTheDocument()
    expect(screen.getByText('0917***567')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '482913' } })
    fireEvent.click(screen.getByRole('button', { name: /^pay ₱5,000.00$/i }))

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/payment/success?bookingId=${booking.id}`))
    expect(confirm).toHaveBeenCalledWith(booking.id, '482913')
  })

  it('shows the server\'s message for a wrong code and stays on the screen', async () => {
    const booking = seedBooking({ status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 500000 })
    vi.spyOn(bookings, 'sendSimulatedCode').mockResolvedValue({ channel: 'email', to: 'ri***@x.com', expiresInSeconds: 300 })
    vi.spyOn(bookings, 'confirmSimulatedPayment').mockRejectedValue(new Error('That code is not right. Check it and try again.'))
    renderScreen(booking.id)

    fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: '09171234567' } })
    fireEvent.click(screen.getByRole('button', { name: /send code/i }))
    expect(await screen.findByText(/emailed a code to/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /^pay /i }))

    expect(await screen.findByText(/code is not right/i)).toBeInTheDocument()
    expect(screen.queryByTestId('where')).not.toBeInTheDocument()
  })

  it('Cancel goes to the cancelled page', async () => {
    const booking = seedBooking({ status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 500000 })
    renderScreen(booking.id)

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/payment/cancelled?bookingId=${booking.id}`))
  })
})
