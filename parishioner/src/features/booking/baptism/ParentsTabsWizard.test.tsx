import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingWizard } from '../wizard/BookingWizard'
import { useAuthStore } from '../../../stores/auth-store'
import { useBookingStore } from '../../../stores/booking-store'

vi.mock('../../../lib/data/availability', () => ({
  fetchAvailabilityDays: vi.fn(async () => []),
  fetchDayAvailability: vi.fn(async (_s: string, date: string) => ({ date, status: 'free', reason: null, freeStarts: ['09:00'] })),
}))
vi.mock('../../../lib/data/services', () => ({
  fetchServices: vi.fn(async () => [{ id: 'baptism', sessionTimes: null, durationMinutes: 45 }]),
}))
vi.mock('../../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))
vi.mock('../../../lib/data/bookings', () => ({ saveDraft: vi.fn(), submitBooking: vi.fn(), updateDraft: vi.fn() }))

const answers = {
  bookingFor: 'other', relationship: 'parent', fatherOmitted: false,
  fatherFirstName: 'Jose', fatherLastName: 'Reyes', fatherPlaceOfBirth: 'Pulilan', fatherPlaceOfBirthCityCode: '031411000', fatherReligion: 'Roman Catholic',
  motherFirstName: 'Maria', motherLastName: 'Santos', motherPlaceOfBirth: 'Malolos', motherReligion: 'Roman Catholic',
  parentsResidence: 'Balagtas, Bulacan',
}

function renderParentsStep() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/booking/baptism/4']}>
        <Routes>
          <Route path="/booking/:sacrament/:step" element={<BookingWizard />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const selected = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) })

describe('Parents step: Next moves through the tabs before it moves to another page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    useBookingStore.getState().startBooking('baptism')
    useBookingStore.getState().updateFormData(answers)
    useAuthStore.getState().setUser({ id: 'u1', fullName: 'Ricardo Dalisay', email: 'r@example.com', phone: '09170000000', address: '', emailVerifiedAt: '2026-01-01' })
  })

  it('is labelled Next, not Continue', async () => {
    renderParentsStep()

    expect(await screen.findByRole('button', { name: 'Next' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^continue$/i })).not.toBeInTheDocument()
  })

  it('goes Father, then Mother, then Family residence, and only then on to the next page', async () => {
    const user = userEvent.setup()
    renderParentsStep()

    await screen.findByRole('tab', { name: /^Father/ })
    expect(selected('Father')).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(selected('Mother')).toHaveAttribute('aria-selected', 'true'))
    expect(screen.queryAllByRole('heading', { name: "Parents' marriage" })).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(selected('Family residence')).toHaveAttribute('aria-selected', 'true'))
    expect(screen.queryAllByRole('heading', { name: "Parents' marriage" })).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect((await screen.findAllByRole('heading', { name: "Parents' marriage" })).length).toBeGreaterThan(0)
  })

  it('stays on Father and says what is missing when the father is incomplete, without marking the other tabs', async () => {
    useBookingStore.getState().updateFormData({ fatherLastName: '', motherFirstName: '' })
    const user = userEvent.setup()
    renderParentsStep()

    await user.click(await screen.findByRole('button', { name: 'Next' }))

    await waitFor(() => expect(screen.getAllByText(/last name/i).length).toBeGreaterThan(0))
    expect(selected('Father')).toHaveAttribute('aria-selected', 'true')
    // The mother's tab has a problem too (a blank first name), but it is not shown until the person gets there.
    expect(screen.getByRole('tab', { name: /^Mother/ })).not.toHaveAccessibleName(/has a problem/)
  })

  it('a blank mother is caught on her own tab, not skipped', async () => {
    useBookingStore.getState().updateFormData({ motherFirstName: '' })
    const user = userEvent.setup()
    renderParentsStep()

    await user.click(await screen.findByRole('button', { name: 'Next' })) // Father is fine
    await waitFor(() => expect(selected('Mother')).toHaveAttribute('aria-selected', 'true'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(screen.getAllByText(/first name/i).length).toBeGreaterThan(0))
    expect(selected('Mother')).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryAllByRole('heading', { name: "Parents' marriage" })).toHaveLength(0)
  })

  it('the mother cannot be left out: there is no such choice', async () => {
    renderParentsStep()

    await screen.findByRole('tab', { name: /^Mother/ })
    expect(screen.queryByLabelText(/leave out the mother/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/leave out the father/i)).toBeInTheDocument()
  })
})
