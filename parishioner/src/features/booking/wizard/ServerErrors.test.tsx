import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingWizard } from './BookingWizard'
import { ApiError } from '../../../lib/api/client'
import { useAuthStore } from '../../../stores/auth-store'
import { useBookingStore } from '../../../stores/booking-store'
import { useServerErrorsStore } from '../../../stores/server-errors-store'
import { addDaysYmd, parishToday } from '../../../lib/domain'
import { fetchDayAvailability } from '../../../lib/data/availability'
import { saveDraft } from '../../../lib/data/bookings'

vi.mock('../../../lib/data/availability', () => ({
  fetchAvailabilityDays: vi.fn(async () => []),
  fetchDayAvailability: vi.fn(async (_s: string, date: string) => ({ date, status: 'free', reason: null, freeStarts: ['09:00', '10:00'] })),
}))
vi.mock('../../../lib/data/services', () => ({
  fetchServices: vi.fn(async () => [{ id: 'house-blessing', sessionTimes: null, durationMinutes: 45 }]),
}))
vi.mock('../../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))
const submitBooking = vi.fn()
vi.mock('../../../lib/data/bookings', () => ({
  saveDraft: vi.fn(async () => ({ id: 'b1', amountDueCentavos: 0, paymentStatus: null })),
  updateDraft: vi.fn(async (id: string) => ({ id, amountDueCentavos: 0, paymentStatus: null })),
  submitBooking: (...a: unknown[]) => submitBooking(...a),
}))

function renderWizard(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/booking/:sacrament/:step" element={<BookingWizard />} />
          <Route path="/services" element={<p>Services page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('server 422 errors reach the step that owns the field', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchDayAvailability).mockImplementation(async (_s, date) => ({ date, status: 'free', reason: null, freeStarts: ['09:00', '10:00'] }))
    useServerErrorsStore.getState().clear()
    useAuthStore.getState().setUser({ id: 'u1', fullName: 'Ricardo Dalisay', email: 'r@example.com', phone: '09170000000', address: '', emailVerifiedAt: '2026-01-01' })
    useBookingStore.getState().startBooking('house-blessing')
    useBookingStore.getState().updateFormData({ bookingFor: 'self', propertyType: 'vehicle', propertyOwner: 'Ricardo Dalisay', vehiclePlate: 'NBC 1234' })
    useBookingStore.getState().setAppointment(addDaysYmd(parishToday(), 7), '10:00')
  })

  it('opens the property step and shows the server message under the field and in the step banner', async () => {
    const user = userEvent.setup()
    submitBooking.mockRejectedValue(
      new ApiError('The formData.vehiclePlate field is invalid.', 422, { 'formData.vehiclePlate': ['The parish register rejects that plate number.'] }),
    )
    renderWizard('/booking/house-blessing/4')

    const submit = await screen.findByRole('button', { name: /submit booking/i })
    await vi.waitFor(() => expect(submit).toBeEnabled())
    await user.click(submit)

    expect(await screen.findByRole('heading', { name: /what will be blessed/i })).toBeInTheDocument()
    expect(screen.getAllByText('The parish register rejects that plate number.').length).toBeGreaterThanOrEqual(2) // banner + field
    // The field's own error is announced too, so look for the step summary among the alerts.
    expect(screen.getAllByRole('alert').some((a) => /could not accept this step/i.test(a.textContent ?? ''))).toBe(true)
  })

  it('opens the schedule step for a slot error', async () => {
    const user = userEvent.setup()
    submitBooking.mockRejectedValue(new ApiError('Conflict', 422, { appointmentStart: ['That time is no longer available. Please choose another.'] }))
    renderWizard('/booking/house-blessing/4')

    const submit = await screen.findByRole('button', { name: /submit booking/i })
    await vi.waitFor(() => expect(submit).toBeEnabled())
    await user.click(submit)

    expect(await screen.findByRole('heading', { name: /choose a date and time/i })).toBeInTheDocument()
    expect(screen.getByText('That time is no longer available. Please choose another.')).toBeInTheDocument()
  })

  it('a slot taken at submit returns to the schedule step (step 1) with every other answer kept, then submits a new time', async () => {
    const user = userEvent.setup()
    const date = addDaysYmd(parishToday(), 7)
    submitBooking.mockRejectedValueOnce(
      new ApiError('Conflict', 422, {
        appointmentDate: ['That date is no longer available.'],
        appointmentStart: ['That time is no longer available. Please choose another.'],
      }),
    )
    submitBooking.mockResolvedValueOnce({ id: 'b1', paymentStatus: 'not_required', status: 'submitted' })
    // Someone else took 10:00 meanwhile.
    vi.mocked(fetchDayAvailability).mockImplementation(async (_s, d) => ({ date: d, status: 'free', reason: null, freeStarts: ['09:00'] }))
    const answers = { ...useBookingStore.getState().formData }
    renderWizard('/booking/house-blessing/4')

    const submit = await screen.findByRole('button', { name: /submit booking/i })
    await vi.waitFor(() => expect(submit).toBeEnabled())
    await user.click(submit)

    expect(await screen.findByRole('heading', { name: /choose a date and time/i })).toBeInTheDocument()
    expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument()
    expect(screen.getByText('That time is no longer available. Please choose another.')).toBeInTheDocument()
    expect(useBookingStore.getState().formData).toEqual(answers)
    expect(useBookingStore.getState().appointmentDate).toBe(date)

    await user.click(await screen.findByRole('radio', { name: '9:00 AM' }))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    // Booking-for comes next, then the property answers, which are still filled in.
    await screen.findByRole('heading', { name: /who is this booking for/i })
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await screen.findByRole('heading', { name: /what will be blessed/i })
    expect(screen.getByLabelText(/plate number/i)).toHaveValue('NBC 1234')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    const again = await screen.findByRole('button', { name: /submit booking/i })
    await vi.waitFor(() => expect(again).toBeEnabled())
    await user.click(again)
    await vi.waitFor(() => expect(submitBooking).toHaveBeenCalledTimes(2))
    expect(vi.mocked(saveDraft).mock.lastCall?.[0]).toMatchObject({ formData: answers, appointmentDate: date, appointmentStart: '09:00' })
  })

  it('clears a step banner once the step is saved again', async () => {
    const user = userEvent.setup()
    useServerErrorsStore.getState().setAll({ property: [{ path: 'vehiclePlate', message: 'Plate rejected' }] })
    renderWizard('/booking/house-blessing/3')
    expect((await screen.findAllByText('Plate rejected')).length).toBeGreaterThan(0)

    await user.clear(screen.getByLabelText(/plate number/i))
    await user.type(screen.getByLabelText(/plate number/i), 'ABC 123')
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(useServerErrorsStore.getState().byStep.property).toBeUndefined()
  })
})
