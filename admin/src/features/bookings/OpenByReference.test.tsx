import { describe, expect, it, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { OpenByReference } from './OpenByReference'
import * as bookingsData from '../../lib/data/bookings'
import type { AdminBooking } from '../../lib/types'

function renderAt(reference: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/check-in/${reference}`]}>
        <Routes>
          <Route path="/check-in/:reference" element={<OpenByReference />} />
          <Route path="/bookings/:id" element={<p>booking page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OpenByReference (what a day-pass QR code opens)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('looks the reference up and sends the office to that booking, where arrival is marked', async () => {
    vi.spyOn(bookingsData, 'fetchBookingByReference').mockResolvedValue({ id: 'b9' } as AdminBooking)
    renderAt('BAP-2026-0007')
    expect(await screen.findByText('booking page')).toBeInTheDocument()
  })

  it('says so when no booking has that reference', async () => {
    vi.spyOn(bookingsData, 'fetchBookingByReference').mockRejectedValue(new Error('No booking has that reference.'))
    renderAt('NOPE')
    expect(await screen.findByText(/No booking has that reference/)).toBeInTheDocument()
  })
})
