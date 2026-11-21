import { StrictMode } from 'react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SubmittedScreen } from './SubmittedScreen'
import { useBookingStore } from '../../../stores/booking-store'
import { useAuthStore } from '../../../stores/auth-store'
import { setViewport } from '../../../test/viewport'

const originalMatchMedia = window.matchMedia
afterEach(() => {
  window.matchMedia = originalMatchMedia
})

vi.mock('../../../lib/data/bookings', () => ({
  fetchBooking: vi.fn(async (id: string) => ({ id, referenceNumber: 'SH-2026-0042', appointmentDate: '2026-11-10', appointmentStart: '10:00' })),
}))

describe('SubmittedScreen', () => {
  it('shows the reference even under StrictMode, whose remount runs the reset cleanup', async () => {
    useBookingStore.getState().startBooking('house-blessing')
    useBookingStore.getState().setBookingId('b42')

    render(
      <StrictMode>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter>
            <SubmittedScreen />
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    )

    expect(await screen.findByText('SH-2026-0042')).toBeInTheDocument()
    // The draft is still cleared — nothing left to resume.
    expect(useBookingStore.getState().bookingId).toBeNull()
  })

  it.each([[1280, true], [390, false]])('at %i px the website frame is %s', async (width, framed) => {
    setViewport(width)
    useAuthStore.setState({ user: { id: 'user-1', fullName: 'Rio', email: 'r@x.com', phone: '', address: '' } })
    useBookingStore.getState().startBooking('house-blessing')
    useBookingStore.getState().setBookingId('b42')
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <SubmittedScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await screen.findByText('SH-2026-0042')
    if (framed) expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    else expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(!!document.querySelector('[data-app-shell]')).toBe(!framed)
  })
})
