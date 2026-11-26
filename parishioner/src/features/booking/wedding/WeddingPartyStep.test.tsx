import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingWizard } from '../wizard/BookingWizard'
import { useAuthStore } from '../../../stores/auth-store'
import { useBookingStore } from '../../../stores/booking-store'
import { expectNoA11yViolations } from '../../../test/a11y'

vi.mock('../../../lib/data/availability', () => ({
  fetchAvailabilityDays: vi.fn(async () => []),
  fetchDayAvailability: vi.fn(async (_s: string, date: string) => ({ date, status: 'free', reason: null, freeStarts: ['09:00'] })),
}))
vi.mock('../../../lib/data/services', () => ({
  fetchServices: vi.fn(async () => [{ id: 'wedding', sessionTimes: null, durationMinutes: 60 }]),
}))
vi.mock('../../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))
vi.mock('../../../lib/data/bookings', () => ({ saveDraft: vi.fn(), submitBooking: vi.fn(), updateDraft: vi.fn() }))

function renderGroomStep() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/booking/wedding/3']}>
        <Routes>
          <Route path="/booking/:sacrament/:step" element={<BookingWizard />} />
          <Route path="/services" element={<p>Services page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const tab = (name: RegExp | string) => screen.getByRole('tab', { name })

describe('wedding party step tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBookingStore.getState().startBooking('wedding')
    useBookingStore.getState().updateFormData({ bookingFor: 'other', relationship: 'self' })
    useAuthStore.getState().setUser({
      id: 'u1', fullName: 'Ricardo Dalisay', email: 'r@example.com', phone: '09170000000', address: '', emailVerifiedAt: '2026-01-01',
    })
  })

  it('shows the person first, with Parents and Sacraments received as their own tabs', async () => {
    renderGroomStep()
    expect(await screen.findByRole('tab', { name: 'About the groom' })).toHaveAttribute('aria-selected', 'true')
    expect(tab('Parents')).toHaveAttribute('aria-selected', 'false')
    expect(tab('Sacraments received')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByLabelText(/^Father's citizenship/, { selector: 'input' })).not.toBeVisible()
  })

  it('checks only the open tab when Next is pressed, and leaves the others unmarked until the person gets there', async () => {
    renderGroomStep()
    await userEvent.click(await screen.findByRole('button', { name: /^next$/i }))
    await waitFor(() => expect(document.getElementById('groomFirstName')).toHaveFocus())
    expect(tab(/About the groom/)).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: /Parents, has a problem/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Sacraments received, has a problem/ })).not.toBeInTheDocument()
  })

  it('marks every tab that holds a problem when Next is pressed on the last tab, and keeps their fields mounted', async () => {
    renderGroomStep()
    await userEvent.click(await screen.findByRole('tab', { name: /Sacraments received/ }))
    await userEvent.click(screen.getByRole('button', { name: /^next$/i }))
    await waitFor(() => expect(tab(/Parents, has a problem/)).toBeInTheDocument())
    expect(tab(/Sacraments received, has a problem/)).toBeInTheDocument()
    await userEvent.click(tab(/Sacraments received/))
    expect(screen.getByLabelText(/^Parish of baptism/)).toBeVisible()
  })

  it('moves focus to the first invalid field, which is on screen', async () => {
    renderGroomStep()
    await userEvent.click(await screen.findByRole('button', { name: /^next$/i }))
    await waitFor(() => expect(document.getElementById("groomFirstName")).toHaveFocus())
  })

  it('has no axe violations with a problem marked on its tab', async () => {
    const { container } = renderGroomStep()
    await userEvent.click(await screen.findByRole('tab', { name: /Sacraments received/ }))
    await userEvent.click(screen.getByRole('button', { name: /^next$/i }))
    await waitFor(() => expect(tab(/Parents, has a problem/)).toBeInTheDocument())
    await expectNoA11yViolations(container)
  })
})
