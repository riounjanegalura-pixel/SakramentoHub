import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { BookingWizard } from './BookingWizard'
import { useAuthStore } from '../../../stores/auth-store'
import { useBookingStore } from '../../../stores/booking-store'
import { fetchAvailabilityDays, fetchDayAvailability } from '../../../lib/data/availability'
import { fetchServices } from '../../../lib/data/services'
import { addDaysYmd, parishToday } from '../../../lib/domain'
import { setViewport } from '../../../test/viewport'
import type { Service } from '../../../lib/types'

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
  fetchServices: vi.fn(async () => [{ id: 'house-blessing', sessionTimes: null, durationMinutes: 45 }]),
}))
vi.mock('../../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))
const saveDraft = vi.fn(async () => ({ id: 'b1', amountDueCentavos: 0, paymentStatus: null }))
const submitBooking = vi.fn(async (_id?: string) => ({ id: 'b1', paymentStatus: 'not_required', status: 'submitted' }))
const updateDraft = vi.fn(async (id: string, _patch?: unknown) => ({ id, amountDueCentavos: 0, paymentStatus: null }))
vi.mock('../../../lib/data/bookings', () => ({
  saveDraft: (...a: unknown[]) => saveDraft(...(a as [])),
  submitBooking: (...a: unknown[]) => submitBooking(...(a as [string])),
  updateDraft: (...a: unknown[]) => updateDraft(...(a as [string, unknown])),
}))

function PaymentProbe() {
  const location = useLocation()
  return <p>Payment page {location.pathname + location.search}</p>
}

/** A complete, valid house-blessing draft parked on Review & Submit (step 4). */
function startValidDraft() {
  useBookingStore.getState().startBooking('house-blessing')
  useBookingStore.getState().updateFormData({ bookingFor: 'self', propertyType: 'vehicle', propertyOwner: 'Ricardo Dalisay', vehiclePlate: 'NBC 1234' })
  useBookingStore.getState().setAppointment(addDaysYmd(parishToday(), 7), '10:00')
}

function renderWizard(path = '/booking/house-blessing/2') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/booking/:sacrament/:step" element={<BookingWizard />} />
          <Route path="/booking/:sacrament/submitted" element={<p>Submitted page</p>} />
          <Route path="/booking/:sacrament/payment" element={<PaymentProbe />} />
          <Route path="/services" element={<p>Services page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BookingWizard (house blessing)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBookingStore.getState().reset()
    useAuthStore.getState().setUser({
      id: 'u1', fullName: 'Ricardo Dalisay', email: 'r@example.com', phone: '09170000000', address: '', emailVerifiedAt: '2026-01-01',
    })
  })

  it('on a desktop shows the step list in one column with no side panel, not the phone frame', async () => {
    setViewport(1280)
    renderWizard()
    expect(await screen.findByRole('navigation', { name: 'Booking steps' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Booking summary' })).toBeNull()
    expect(document.querySelector('[data-app-shell]')).toBeNull()
    setViewport(390)
  })

  it('on a phone keeps the phone frame with no step list', async () => {
    setViewport(390)
    const { container } = renderWizard()
    expect(await screen.findByRole('heading', { name: /who is this booking for/i })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Booking steps' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-app-shell]')).not.toBeNull()
  })

  it('walks schedule → booking-for → property → review → submit', async () => {
    const user = userEvent.setup()
    renderWizard('/booking/house-blessing/1')

    // The calendar is the very first thing, so availability is seen before any field is filled in.
    await screen.findByRole('heading', { name: /choose a date and time/i })
    const days = await screen.findAllByRole('button', { name: /\d{4}/ })
    const enabled = days.filter((d) => !d.hasAttribute('disabled'))
    await user.click(enabled[enabled.length - 1])
    await user.click(await screen.findByRole('radio', { name: '10:00 AM' }))
    await user.click(screen.getByRole('button', { name: /^next$/i }))

    expect(await screen.findByRole('heading', { name: /who is this booking for/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^next$/i }))

    await screen.findByRole('heading', { name: /what will be blessed/i })
    await user.click(screen.getByRole('radio', { name: /vehicle/i }))
    await user.type(screen.getByLabelText(/plate number/i), 'NBC 1234')
    await user.click(screen.getByRole('button', { name: /^next$/i }))

    await screen.findByRole('heading', { name: /review your booking/i })
    expect(screen.getByText('NBC 1234')).toBeInTheDocument()
    expect(screen.getByText('Ricardo Dalisay')).toBeInTheDocument() // owner prefilled from the account
    expect(await screen.findByText(/no fee/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /submit booking/i }))
    expect(await screen.findByText('Submitted page')).toBeInTheDocument()
    expect(submitBooking).toHaveBeenCalledWith('b1')
  })

  it('shows field errors instead of advancing', async () => {
    const user = userEvent.setup()
    renderWizard('/booking/house-blessing/3')

    await screen.findByRole('heading', { name: /what will be blessed/i })
    await user.click(screen.getByRole('button', { name: /^next$/i }))
    // Under the field and as a link in the error summary.
    expect((await screen.findAllByText('Choose what will be blessed')).length).toBeGreaterThan(0)
  })

  it('review lists problems with a link to the step that fixes them', async () => {
    const user = userEvent.setup()
    useBookingStore.getState().startBooking('house-blessing')
    useBookingStore.getState().updateFormData({ bookingFor: 'self', propertyType: 'house', propertyOwner: 'Ricardo Dalisay' })
    renderWizard('/booking/house-blessing/4')

    expect(await screen.findByText('Select the city/municipality and barangay')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit booking/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /fix/i }))
    expect(await screen.findByRole('heading', { name: /what will be blessed/i })).toBeInTheDocument()
  })

  it('unknown sacraments go back to Services', async () => {
    renderWizard('/booking/exorcism/1')
    expect(await screen.findByText('Services page')).toBeInTheDocument()
  })

  it('a malformed step number falls back to a real step instead of crashing', async () => {
    renderWizard('/booking/house-blessing/3.5')
    expect(await screen.findByRole('heading', { name: /what will be blessed/i })).toBeInTheDocument()
  })

  it("a cold deep link never carries another sacrament's draft answers into the form", async () => {
    useBookingStore.getState().startBooking('baptism')
    useBookingStore.getState().updateFormData({ propertyOwner: 'Stale Baptism Answer' })
    renderWizard('/booking/house-blessing/3')

    await screen.findByRole('heading', { name: /what will be blessed/i })
    expect(screen.getByLabelText(/owner's full name/i)).toHaveValue('')
    expect(useBookingStore.getState().sacrament).toBe('house-blessing')
    expect(useBookingStore.getState().formData).toEqual({})
  })

  it('an unpaid booking goes from Submit to the payment screen for that booking', async () => {
    const user = userEvent.setup()
    saveDraft.mockResolvedValueOnce({ id: 'b1', amountDueCentavos: 50000, paymentStatus: null })
    saveDraft.mockResolvedValueOnce({ id: 'b1', amountDueCentavos: 50000, paymentStatus: null })
    submitBooking.mockResolvedValueOnce({ id: 'b1', paymentStatus: 'unpaid', status: 'submitted' })
    startValidDraft()
    renderWizard('/booking/house-blessing/4')

    await user.click(await screen.findByRole('button', { name: /submit & pay with gcash/i }))
    expect(await screen.findByText('Payment page /booking/house-blessing/payment?bookingId=b1')).toBeInTheDocument()
  })

  it('a returned booking being edited is updated in place and submitted under its own id', async () => {
    const user = userEvent.setup()
    submitBooking.mockResolvedValueOnce({ id: 'r1', paymentStatus: 'not_required', status: 'submitted' })
    startValidDraft()
    useBookingStore.getState().setEditingBookingId('r1')
    const { formData, appointmentDate, appointmentStart } = useBookingStore.getState()
    renderWizard('/booking/house-blessing/4')

    await screen.findByText(/no fee/i)
    await user.click(screen.getByRole('button', { name: /submit booking/i }))
    expect(await screen.findByText('Submitted page')).toBeInTheDocument()

    expect(updateDraft).toHaveBeenCalledWith('r1', { formData, appointmentDate, appointmentStart })
    expect(saveDraft).not.toHaveBeenCalled()
    expect(submitBooking).toHaveBeenCalledWith('r1')
    expect(useBookingStore.getState().editingBookingId).toBeNull()
  })

  it('an unpaid resubmit left at the payment screen does not leak its id into the next booking', async () => {
    const user = userEvent.setup()
    updateDraft.mockResolvedValueOnce({ id: 'r1', amountDueCentavos: 50000, paymentStatus: null })
    updateDraft.mockResolvedValueOnce({ id: 'r1', amountDueCentavos: 50000, paymentStatus: null })
    submitBooking.mockResolvedValueOnce({ id: 'r1', paymentStatus: 'unpaid', status: 'submitted' })
    startValidDraft()
    useBookingStore.getState().setEditingBookingId('r1')
    const first = renderWizard('/booking/house-blessing/4')

    await user.click(await screen.findByRole('button', { name: /submit & pay with gcash/i }))
    expect(await screen.findByText('Payment page /booking/house-blessing/payment?bookingId=r1')).toBeInTheDocument()
    first.unmount()

    // The parishioner leaves without paying and books the same sacrament again.
    updateDraft.mockClear()
    renderWizard('/booking/house-blessing/4')
    await screen.findByText(/no fee/i)
    expect(saveDraft).toHaveBeenCalled()
    expect(updateDraft).not.toHaveBeenCalled()
  })

  it('a failed submit is announced as an alert and stays on Review', async () => {
    const user = userEvent.setup()
    submitBooking.mockRejectedValueOnce(new Error('That time was just taken. Please pick another.'))
    startValidDraft()
    renderWizard('/booking/house-blessing/4')

    await screen.findByText(/no fee/i)
    await user.click(screen.getByRole('button', { name: /submit booking/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That time was just taken. Please pick another.')
    expect(screen.getByRole('heading', { name: /review your booking/i })).toBeInTheDocument()
  })

  it('a failed fee quote shows an error with a retry instead of calculating forever', async () => {
    const user = userEvent.setup()
    saveDraft.mockRejectedValueOnce(new Error('Network down'))
    startValidDraft()
    renderWizard('/booking/house-blessing/4')

    expect(await screen.findByText(/couldn't work out the fee/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit booking/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText(/no fee/i)).toBeInTheDocument()
  })

  it('the schedule step excludes the returned booking being edited, so the slot it holds stays selectable', async () => {
    startValidDraft()
    useBookingStore.getState().setEditingBookingId('r1')
    renderWizard('/booking/house-blessing/1')

    expect(await screen.findByRole('radio', { name: '10:00 AM' })).toBeInTheDocument()
    await waitFor(() => expect(fetchAvailabilityDays).toHaveBeenCalled())
    expect(vi.mocked(fetchDayAvailability).mock.calls[0][3]).toBe('r1')
    expect(vi.mocked(fetchAvailabilityDays).mock.calls[0][4]).toBe('r1')
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled()
  })

  it("the schedule step excludes the draft's own saved booking, and nothing for a brand-new draft", async () => {
    startValidDraft()
    const first = renderWizard('/booking/house-blessing/1')
    await screen.findByRole('radio', { name: '10:00 AM' })
    expect(vi.mocked(fetchDayAvailability).mock.calls[0][3]).toBeUndefined()
    first.unmount()

    vi.clearAllMocks()
    useBookingStore.getState().setBookingId('d1')
    renderWizard('/booking/house-blessing/1')
    await screen.findByRole('radio', { name: '10:00 AM' })
    expect(vi.mocked(fetchDayAvailability).mock.calls[0][3]).toBe('d1')
  })

  it('a failed free-times load shows an error with a retry, not "no free times"', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchDayAvailability).mockRejectedValueOnce(new Error('Network down'))
    startValidDraft()
    useBookingStore.getState().setAppointment(addDaysYmd(parishToday(), 7), null)
    renderWizard('/booking/house-blessing/1')

    expect(await screen.findByText(/couldn't load the free times/i)).toBeInTheDocument()
    expect(screen.queryByText(/no free times left/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('radio', { name: '10:00 AM' })).toBeInTheDocument()
  })

  it('does not load the calendar until the service (and so its schedule context) is known', async () => {
    let resolveServices: (s: Service[]) => void = () => {}
    vi.mocked(fetchServices).mockImplementationOnce(() => new Promise<Service[]>((r) => (resolveServices = r)))
    startValidDraft()
    renderWizard('/booking/house-blessing/1')

    await screen.findByRole('heading', { name: /choose a date and time/i })
    expect(fetchAvailabilityDays).not.toHaveBeenCalled()
    resolveServices([{ id: 'house-blessing', sessionTimes: null, durationMinutes: 45 } as unknown as Service])
    await waitFor(() => expect(fetchAvailabilityDays).toHaveBeenCalled())
  })
})
