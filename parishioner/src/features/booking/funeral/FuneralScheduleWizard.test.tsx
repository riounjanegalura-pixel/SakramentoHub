import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingWizard } from '../wizard/BookingWizard'
import { useAuthStore } from '../../../stores/auth-store'
import { useBookingStore } from '../../../stores/booking-store'
import { fetchDayAvailability } from '../../../lib/data/availability'
import { addDaysYmd, parishToday } from '../../../lib/domain'

vi.mock('../../../lib/data/availability', () => ({
  fetchAvailabilityDays: vi.fn(async (_s: string, start: string, end: string) => {
    const days = []
    for (let d = new Date(`${start}T00:00:00`); d <= new Date(`${end}T00:00:00`); d.setDate(d.getDate() + 1)) {
      days.push({ date: d.toISOString().slice(0, 10), status: 'free', reason: null, freeCount: 2 })
    }
    return days
  }),
  fetchDayAvailability: vi.fn(async (_s: string, date: string) => ({ date, status: 'free', reason: null, freeStarts: ['09:00', '10:00'] })),
}))
vi.mock('../../../lib/data/services', () => ({
  fetchServices: vi.fn(async () => [{ id: 'funeral', sessionTimes: null, durationMinutes: 60 }]),
}))
vi.mock('../../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))
vi.mock('../../../lib/data/documents', () => ({ uploadDocument: vi.fn(async () => ({ url: '/files/death.pdf' })) }))
const saveDraft = vi.fn(async (_input: unknown) => ({ id: 'b1', amountDueCentavos: 0, paymentStatus: null }))
const submitBooking = vi.fn(async () => ({ id: 'b1', paymentStatus: 'not_required', status: 'submitted' }))
vi.mock('../../../lib/data/bookings', () => ({
  saveDraft: (...a: unknown[]) => saveDraft(...(a as [unknown])),
  submitBooking: (...a: unknown[]) => submitBooking(...(a as [])),
  updateDraft: vi.fn(),
}))

const store = () => useBookingStore.getState()
const slot = addDaysYmd(parishToday(), 7)

/** Every funeral answer, valid, for a house Mass at the wake. */
const HOUSE_MASS_DRAFT = {
  bookingFor: 'other',
  relationship: 'child',
  deceasedFirstName: 'Lorenzo',
  deceasedLastName: 'Pascual',
  deceasedSex: 'male',
  deceasedAge: 81,
  deceasedCivilStatus: 'widowed',
  deceasedReligion: 'Roman Catholic',
  deceasedDateOfDeath: addDaysYmd(parishToday(), -2),
  deceasedResidence: 'San Juan, Balagtas, Bulacan',
  burialCemetery: 'Balagtas Public Cemetery',
  burialDate: addDaysYmd(parishToday(), 8),
  massType: 'house',
  houseMassAddress: 'San Juan, Balagtas, Bulacan',
  houseMassAddressLine: '45 Rizal St.',
  deathCertificate: '/files/death.pdf',
}

function renderWizard(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/booking/:sacrament/:step" element={<BookingWizard />} />
          <Route path="/booking/:sacrament/submitted" element={<p>Submitted page</p>} />
          <Route path="/services" element={<p>Services page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('funeral: the Mass place is asked with the date and time (step 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store().reset()
    useAuthStore.getState().setUser({ id: 'u1', fullName: 'Ricardo Dalisay', email: 'r@example.com', phone: '09170000000', address: '', emailVerifiedAt: '2026-01-01' })
  })

  it('asks where the Mass will be above the calendar, and holds the calendar back until it is answered', async () => {
    const user = userEvent.setup()
    store().startBooking('funeral')
    store().updateFormData({ bookingFor: 'other', relationship: 'child' })
    renderWizard('/booking/funeral/1')

    expect(await screen.findByRole('heading', { name: /choose a date and time/i })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: /where will the mass be/i })).toBeInTheDocument()
    expect(screen.getByText(/choose where the mass will be to see the free dates/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByText('Choose where the Mass will be')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /choose a date and time/i })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /house mass/i }))
    expect(screen.queryByText(/to see the free dates/i)).not.toBeInTheDocument()
    expect(document.getElementById('appointment-date-label')).toHaveTextContent('Date')
  })

  it('changing the Mass place drops the chosen slot and asks for times with the new place', async () => {
    const user = userEvent.setup()
    store().startBooking('funeral')
    store().updateFormData({ bookingFor: 'other', relationship: 'child', massType: 'church' })
    store().setAppointment(slot, '10:00')
    renderWizard('/booking/funeral/1')

    expect(await screen.findByRole('radio', { name: '10:00 AM', checked: true })).toBeInTheDocument()
    expect(vi.mocked(fetchDayAvailability).mock.calls.at(-1)?.[2]).toEqual({ massType: 'church' })

    await user.click(screen.getByRole('radio', { name: /house mass/i }))
    expect(store().appointmentDate).toBeNull()
    expect(store().appointmentStart).toBeNull()
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose a date and a time/i)
    expect(screen.getByRole('heading', { name: /choose a date and time/i })).toBeInTheDocument()
  })

  it('a changed Mass place reaches the submitted booking, and a church Mass drops the wake address', async () => {
    const user = userEvent.setup()
    store().startBooking('funeral')
    store().updateFormData(HOUSE_MASS_DRAFT)
    store().setAppointment(slot, '10:00')
    renderWizard('/booking/funeral/1')

    await screen.findByRole('radio', { name: '10:00 AM', checked: true })
    await user.click(screen.getByRole('radio', { name: /church mass/i }))
    expect(store().appointmentStart).toBeNull()
    const days = (await screen.findAllByRole('button', { name: /\d{4}/ })).filter((d) => !d.hasAttribute('disabled'))
    await user.click(days[days.length - 1])
    await user.click(await screen.findByRole('radio', { name: '9:00 AM' }))
    expect(vi.mocked(fetchDayAvailability).mock.calls.at(-1)?.[2]).toEqual({ massType: 'church' })
    const chosenDate = store().appointmentDate
    await user.click(screen.getByRole('button', { name: /continue/i }))

    // Booking-for comes right after the calendar.
    await screen.findByRole('heading', { name: /who is/i })
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await screen.findByRole('heading', { name: /about the deceased/i })
    expect(store().formData.massType).toBe('church')
    expect(store().formData.houseMassAddress).toBeUndefined()
    expect(store().formData.houseMassAddressLine).toBeUndefined()
    expect(store().appointmentStart).toBe('09:00')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    // The Mass step keeps the cemetery and burial date; the wake address is only asked for a house Mass.
    await screen.findByLabelText(/cemetery/i)
    expect(screen.queryByRole('radiogroup', { name: /where will the mass be/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/address of the wake/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await screen.findByRole('heading', { name: 'Requirements', level: 2 })
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await screen.findByRole('heading', { name: /review your booking/i })
    const schedule = screen.getByRole('heading', { name: 'Schedule' }).closest('section') as HTMLElement
    expect(schedule).toHaveTextContent('Church Mass')
    const submit = screen.getByRole('button', { name: /submit booking/i })
    await waitFor(() => expect(submit).toBeEnabled())
    await user.click(submit)
    expect(await screen.findByText('Submitted page')).toBeInTheDocument()

    const payload = saveDraft.mock.lastCall?.[0] as { formData: Record<string, unknown>; appointmentDate: string; appointmentStart: string }
    expect(payload.formData.massType).toBe('church')
    expect(payload.formData.houseMassAddress).toBeUndefined()
    expect(payload.appointmentDate).toBe(chosenDate)
    expect(payload.appointmentStart).toBe('09:00')
  })

  it('a house Mass still asks for the wake address on the Mass & burial step', async () => {
    store().startBooking('funeral')
    store().updateFormData({ ...HOUSE_MASS_DRAFT, houseMassAddress: undefined, houseMassAddressLine: undefined })
    renderWizard('/booking/funeral/4')
    expect(await screen.findByText(/address of the wake/i)).toBeInTheDocument()
  })
})
