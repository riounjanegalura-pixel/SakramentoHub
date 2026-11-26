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

const mother = {
  motherFirstName: 'Maria', motherLastName: 'Santos', motherPlaceOfBirth: 'Malolos', motherReligion: 'Roman Catholic',
  parentsResidence: 'Balagtas, Bulacan',
}
const father = {
  fatherFirstName: 'Jose', fatherMiddleName: 'Cruz', fatherLastName: 'Reyes', fatherPlaceOfBirth: 'Pulilan',
  fatherPlaceOfBirthCityCode: '031411000', fatherReligion: 'Roman Catholic',
}

function renderParentsStep() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/booking/baptism/4']}>
        <Routes>
          <Route path="/booking/:sacrament/:step" element={<BookingWizard />} />
          <Route path="/services" element={<p>Services page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BookingWizard (baptism parents): hidden answers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBookingStore.getState().startBooking('baptism')
    useBookingStore.getState().updateFormData({ bookingFor: 'other', relationship: 'parent', ...father, ...mother, fatherOmitted: false })
    useAuthStore.getState().setUser({
      id: 'u1', fullName: 'Ricardo Dalisay', email: 'r@example.com', phone: '09170000000', address: '', emailVerifiedAt: '2026-01-01',
    })
  })

  it("leaving out the father's details drops every father answer from the draft but keeps the mother's", async () => {
    const user = userEvent.setup()
    renderParentsStep()

    await user.click(await screen.findByLabelText("Leave out the father's details"))
    await user.selectOptions(await screen.findByLabelText(/^Reason/), 'Estranged / uncontactable')
    // Next walks the tabs (Father, Mother, Family residence); the answers reach the draft when the step is left.
    await user.click(screen.getByRole('button', { name: /^next$/i }))
    await user.click(screen.getByRole('button', { name: /^next$/i }))
    await user.click(screen.getByRole('button', { name: /^next$/i }))

    await waitFor(() => expect(useBookingStore.getState().formData.fatherOmitted).toBe(true))
    const saved = JSON.parse(JSON.stringify(useBookingStore.getState().formData))
    expect(Object.keys(saved).filter((k) => /^father(?!Omitted)/.test(k))).toEqual([])
    expect(saved.fatherOmittedReason).toBe('Estranged / uncontactable')
    expect(saved.motherFirstName).toBe('Maria')
    expect(saved.motherReligion).toBe('Roman Catholic')
  })

  it('keeps the father answers when the father stays included', async () => {
    const user = userEvent.setup()
    renderParentsStep()

    await user.click(await screen.findByRole('button', { name: /^next$/i }))

    await waitFor(() => expect(useBookingStore.getState().formData.motherFirstName).toBe('Maria'))
    const saved = useBookingStore.getState().formData
    expect(saved.fatherFirstName).toBe('Jose')
    expect(saved.fatherReligion).toBe('Roman Catholic')
  })
})
