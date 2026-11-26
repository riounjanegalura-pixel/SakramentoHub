import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
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
  fetchServices: vi.fn(async () => [{ id: 'anointing', sessionTimes: null, durationMinutes: 45 }]),
}))
vi.mock('../../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))
const saveDraft = vi.fn(async () => ({ id: 'b1', amountDueCentavos: 0, paymentStatus: null }))
const submitBooking = vi.fn(async () => ({ id: 'b1', paymentStatus: 'not_required', status: 'submitted' }))
vi.mock('../../../lib/data/bookings', () => ({
  saveDraft: (...a: unknown[]) => saveDraft(...(a as [])),
  submitBooking: (...a: unknown[]) => submitBooking(...(a as [])),
}))

function startPatientDraft(inDangerOfDeath: boolean) {
  useBookingStore.getState().startBooking('anointing')
  useBookingStore.getState().updateFormData({
    bookingFor: 'other', relationship: 'parent', patientFirstName: 'Consolacion', patientLastName: 'Aquino',
    patientSex: 'female', patientAge: 88, locationType: 'hospital', hospitalName: 'BMC', hospitalRoom: 'Ward 3',
    inDangerOfDeath,
  })
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

describe('BookingWizard (anointing, urgent path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBookingStore.getState().reset()
    useAuthStore.getState().setUser({
      id: 'u1', fullName: 'Ricardo Dalisay', email: 'r@example.com', phone: '09170000000', address: '', emailVerifiedAt: '2026-01-01',
    })
  })

  it('shows the call-the-parish notice with the parish phone instead of a calendar', async () => {
    startPatientDraft(true)
    renderWizard('/booking/anointing/3')

    expect(await screen.findByRole('alert')).toHaveTextContent(/call the parish now/i)
    const call = await screen.findByRole('link', { name: /09123456789/ })
    expect(call).toHaveAttribute('href', 'tel:09123456789')
    expect(screen.queryByText(/loading the calendar/i)).not.toBeInTheDocument()
  })

  it('lets an urgent request be submitted from Review with no appointment', async () => {
    const user = userEvent.setup()
    startPatientDraft(true)
    renderWizard('/booking/anointing/4')

    expect(await screen.findByText(/urgent — the parish will contact you/i)).toBeInTheDocument()
    await screen.findByText(/no fee/i)
    const submit = screen.getByRole('button', { name: /submit booking/i })
    expect(submit).toBeEnabled()
    await user.click(submit)
    expect(await screen.findByText('Submitted page')).toBeInTheDocument()
    expect(submitBooking).toHaveBeenCalledWith('b1')
  })

  it('blocks Submit for a non-urgent request with no date and time', async () => {
    startPatientDraft(false)
    renderWizard('/booking/anointing/4')

    expect(await screen.findByText(/no date and time chosen yet/i)).toBeInTheDocument()
    await screen.findByText(/no fee/i)
    expect(screen.getByRole('button', { name: /submit booking/i })).toBeDisabled()
  })

  it('asks whether the patient is in danger of death right now', async () => {
    startPatientDraft(true)
    renderWizard('/booking/anointing/2')

    expect(await screen.findByText('Is the patient in danger of death right now?')).toBeInTheDocument()
  })

  it('accepts the danger-of-death answer when it is clicked, stores a boolean, and shows it chosen on return', async () => {
    const user = userEvent.setup()
    startPatientDraft(true)
    useBookingStore.getState().updateFormData({ inDangerOfDeath: undefined })
    const view = renderWizard('/booking/anointing/2')

    await user.click(await screen.findByLabelText(/yes, urgent/i))
    await user.click(screen.getByRole('button', { name: /^next$/i }))

    expect(await screen.findByText(/call the parish now/i)).toBeInTheDocument()
    expect(useBookingStore.getState().formData.inDangerOfDeath).toBe(true)

    view.unmount()
    renderWizard('/booking/anointing/2')
    expect(await screen.findByLabelText(/yes, urgent/i)).toBeChecked()
    expect(screen.getByLabelText(/^no/i)).not.toBeChecked()
  })

  describe('an urgent request needs a number the priest can call', () => {
    const MESSAGE = /add a mobile number we can call right now/i

    async function continueFromPatient(phone: string, typed?: string) {
      const user = userEvent.setup()
      useAuthStore.getState().setUser({
        id: 'u1', fullName: 'Ricardo Dalisay', email: 'r@example.com', phone, address: '', emailVerifiedAt: '2026-01-01',
      })
      startPatientDraft(true)
      useBookingStore.getState().updateFormData({ inDangerOfDeath: undefined })
      renderWizard('/booking/anointing/2')
      await user.click(await screen.findByLabelText(/yes, urgent/i))
      if (typed) await user.type(await screen.findByLabelText(/mobile number we can call/i), typed)
      await user.click(screen.getByRole('button', { name: /^next$/i }))
    }

    it('asks for one when the profile has no valid mobile and none is given', async () => {
      await continueFromPatient('')
      expect((await screen.findAllByText(MESSAGE)).length).toBeGreaterThan(0)
      expect(screen.queryByText(/call the parish now/i)).not.toBeInTheDocument()
    })

    it('goes on once a valid mobile number is typed', async () => {
      await continueFromPatient('', '09171234567')
      expect(await screen.findByText(/call the parish now/i)).toBeInTheDocument()
      expect(useBookingStore.getState().formData.alternatePhone).toBe('09171234567')
    })

    it('does not ask when the profile already has a valid mobile', async () => {
      await continueFromPatient('09170000000')
      expect(await screen.findByText(/call the parish now/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/mobile number we can call/i)).not.toBeInTheDocument()
    })
  })
})
