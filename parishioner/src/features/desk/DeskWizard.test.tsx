import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingWizard } from '../booking/wizard/BookingWizard'
import { ApiError } from '../../lib/api/client'
import { addDaysYmd, parishToday } from '../../lib/domain'
import { useAuthStore } from '../../stores/auth-store'
import { useBookingStore } from '../../stores/booking-store'
import { useDeskStore } from '../../stores/desk-store'
import { useServerErrorsStore } from '../../stores/server-errors-store'

const lookupParishioner = vi.fn()
const createWalkIn = vi.fn()
const updateWalkIn = vi.fn()
const submitWalkIn = vi.fn()
vi.mock('../../lib/data/walkIns', () => ({
  lookupParishioner: (...a: unknown[]) => lookupParishioner(...a),
  createWalkIn: (...a: unknown[]) => createWalkIn(...a),
  updateWalkIn: (...a: unknown[]) => updateWalkIn(...a),
  submitWalkIn: (...a: unknown[]) => submitWalkIn(...a),
  fetchDeskBooking: vi.fn(),
}))
const fetchDayAvailability = vi.fn()
vi.mock('../../lib/data/availability', () => ({
  fetchAvailabilityDays: vi.fn(async () => []),
  fetchDayAvailability: (...a: unknown[]) => fetchDayAvailability(...a),
}))
vi.mock('../../lib/data/services', () => ({
  fetchServices: vi.fn(async () => [{ id: 'house-blessing', sessionTimes: null, durationMinutes: 45 }]),
}))
vi.mock('../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))
vi.mock('../../lib/data/useApi', () => ({ useApi: true }))

function renderDesk(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/desk" element={<p>Desk home</p>} />
          <Route path="/desk/result/:id" element={<p>Result page</p>} />
          <Route path="/desk/:sacrament/:step" element={<BookingWizard mode="desk" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const slot = addDaysYmd(parishToday(), 1)

describe('office desk wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBookingStore.getState().reset()
    useDeskStore.getState().reset()
    useServerErrorsStore.getState().clear()
    useAuthStore.setState({
      user: { id: 's1', fullName: 'Staff User', email: 's@example.com', phone: '', address: '', emailVerifiedAt: '2026-01-01', role: 'staff' },
      isBootstrapping: false,
    })
    fetchDayAvailability.mockImplementation(async (_s: string, date: string) => ({ date, status: 'free', reason: null, freeStarts: ['09:00', '10:00'] }))
  })

  describe('walk-in contact step', () => {
    beforeEach(() => useBookingStore.getState().startBooking('house-blessing'))

    it('replaces "Who is this booking for?" with the walk-in contact', async () => {
      renderDesk('/desk/house-blessing/2')
      expect(await screen.findByRole('heading', { name: /who is at the counter/i })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /who is this booking for/i })).not.toBeInTheDocument()
    })

    it('needs a name, a PH mobile number and a relationship; the email is optional', async () => {
      const user = userEvent.setup()
      renderDesk('/desk/house-blessing/2')
      await user.click(await screen.findByRole('button', { name: /continue/i }))
      expect(await screen.findByText('Enter their full name')).toBeInTheDocument()
      expect(screen.getByText('Enter a valid PH mobile number (09XXXXXXXXX)')).toBeInTheDocument()
      expect(screen.getByText(/choose who is receiving the sacrament/i)).toBeInTheDocument()

      await user.type(screen.getByLabelText(/full name/i), 'Aling Rosa Dela Cruz')
      await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
      await user.selectOptions(screen.getByLabelText(/who is receiving it/i), 'relative')
      await user.type(screen.getByLabelText(/email/i), 'not-an-email')
      await user.click(screen.getByRole('button', { name: /continue/i }))
      expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()

      await user.clear(screen.getByLabelText(/email/i))
      await user.click(screen.getByRole('button', { name: /continue/i }))
      // The contact is complete, so the property step follows (the calendar was the first step).
      expect(await screen.findByRole('heading', { name: /what will be blessed/i }, { timeout: 5000 })).toBeInTheDocument()

      expect(useDeskStore.getState().contact).toEqual({ fullName: 'Aling Rosa Dela Cruz', phone: '09171234567', email: '' })
      expect(useBookingStore.getState().formData).toMatchObject({ bookingFor: 'other', relationship: 'relative' })
    })

    it('records "the person at the counter" as booking for themselves', async () => {
      const user = userEvent.setup()
      renderDesk('/desk/house-blessing/2')
      await user.type(await screen.findByLabelText(/full name/i), 'Mang Tino')
      await user.type(screen.getByLabelText(/mobile number/i), '09181234567')
      await user.selectOptions(screen.getByLabelText(/who is receiving it/i), 'self')
      await user.click(screen.getByRole('button', { name: /continue/i }))
      await screen.findByRole('heading', { name: /what will be blessed/i })
      expect(useBookingStore.getState().formData).toMatchObject({ bookingFor: 'self', relationship: null })
    })

    it('does not offer "the person at the counter" for a funeral', async () => {
      useBookingStore.getState().startBooking('funeral')
      renderDesk('/desk/funeral/2')
      await screen.findByRole('heading', { name: /who is at the counter/i })
      expect(screen.queryByRole('option', { name: /the person at the counter/i })).not.toBeInTheDocument()
      expect(screen.getByRole('option', { name: /their parent/i })).toBeInTheDocument()
    })

    it('shows the account behind an email and links it only after an explicit confirm', async () => {
      const user = userEvent.setup()
      lookupParishioner.mockResolvedValue({ id: 'acct-1', fullName: 'Maria Santos' })
      renderDesk('/desk/house-blessing/2')
      await user.type(await screen.findByLabelText(/email/i), 'Maria@Example.com')
      await user.click(screen.getByRole('button', { name: /check for a parishioner account/i }))

      expect(lookupParishioner).toHaveBeenCalledWith('maria@example.com')
      expect(await screen.findByText('Maria Santos')).toBeInTheDocument()
      expect(useDeskStore.getState().linkedAccount).toBeNull() // shown, not linked

      await user.click(screen.getByRole('button', { name: /yes, link to maria santos/i }))
      expect(useDeskStore.getState().linkedAccount).toEqual({ id: 'acct-1', fullName: 'Maria Santos', email: 'maria@example.com' })
      expect(screen.getByText(/linked to/i)).toBeInTheDocument()

      // A different email is not the account that was confirmed.
      await user.type(screen.getByLabelText(/email/i), 'x')
      await waitFor(() => expect(useDeskStore.getState().linkedAccount).toBeNull())
    })

    it('can decline the link, and says when no account uses the email', async () => {
      const user = userEvent.setup()
      lookupParishioner.mockResolvedValueOnce({ id: 'acct-1', fullName: 'Maria Santos' }).mockResolvedValueOnce(null)
      renderDesk('/desk/house-blessing/2')
      await user.type(await screen.findByLabelText(/email/i), 'maria@example.com')
      await user.click(screen.getByRole('button', { name: /check for a parishioner account/i }))
      await user.click(await screen.findByRole('button', { name: /no, keep it separate/i }))
      expect(screen.queryByText('Maria Santos')).not.toBeInTheDocument()
      expect(useDeskStore.getState().linkedAccount).toBeNull()

      await user.clear(screen.getByLabelText(/email/i))
      await user.type(screen.getByLabelText(/email/i), 'nobody@example.com')
      await user.click(screen.getByRole('button', { name: /check for a parishioner account/i }))
      expect(await screen.findByText(/no parishioner account uses that email/i)).toBeInTheDocument()
    })
  })

  describe('schedule step', () => {
    beforeEach(() => {
      useBookingStore.getState().startBooking('house-blessing')
      useBookingStore.getState().updateFormData({ bookingFor: 'other', relationship: 'relative', propertyType: 'vehicle', propertyOwner: 'Nena', vehiclePlate: 'NBC 1234' })
      useBookingStore.getState().setAppointment(slot, '10:00')
    })

    it('lets the office waive the lead time with a reason, and asks the server to ignore it', async () => {
      const user = userEvent.setup()
      renderDesk('/desk/house-blessing/1')
      await screen.findByRole('heading', { name: /choose a date and time/i })
      expect(fetchDayAvailability.mock.calls.every((c) => !(c[2] as { waiveLeadTime?: boolean }).waiveLeadTime)).toBe(true)

      await user.click(screen.getByRole('checkbox', { name: /waive the lead-time rule/i }))
      expect(await screen.findByLabelText(/^reason/i)).toBeInTheDocument()
      // Continue stays enabled; pressing it without a reason says what is missing.
      expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled()
      await user.click(screen.getByRole('button', { name: /continue/i }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/choose a date and a time|reason/i)

      await user.type(screen.getByLabelText(/^reason/i), 'Moving in tomorrow')
      await waitFor(() => expect(fetchDayAvailability).toHaveBeenCalledWith('house-blessing', slot, expect.objectContaining({ waiveLeadTime: true }), undefined))
      expect(useDeskStore.getState()).toMatchObject({ waiveLeadTime: true, waiveReason: 'Moving in tomorrow' })
      await waitFor(() => expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled())
    })

    it('walks schedule → contact → property → review at the counter and submits the chosen slot', async () => {
      const user = userEvent.setup()
      useBookingStore.getState().startBooking('house-blessing')
      useBookingStore.getState().setAppointment(slot, null)
      createWalkIn.mockResolvedValue({ id: 'w1', amountDueCentavos: 0, paymentStatus: 'not_required' })
      updateWalkIn.mockResolvedValue({ id: 'w1', amountDueCentavos: 0, paymentStatus: 'not_required' })
      submitWalkIn.mockResolvedValue({ id: 'w1', status: 'submitted', paymentStatus: 'not_required' })
      renderDesk('/desk/house-blessing/1')

      await screen.findByRole('heading', { name: /choose a date and time/i })
      expect(screen.getByRole('checkbox', { name: /waive the lead-time rule/i })).toBeInTheDocument()
      await user.click(await screen.findByRole('radio', { name: '9:00 AM' }))
      await user.click(screen.getByRole('button', { name: /continue/i }))

      await user.type(await screen.findByLabelText(/full name/i), 'Aling Rosa Dela Cruz')
      await user.type(screen.getByLabelText(/mobile number/i), '09171234567')
      await user.selectOptions(screen.getByLabelText(/who is receiving it/i), 'relative')
      await user.click(screen.getByRole('button', { name: /continue/i }))

      await screen.findByRole('heading', { name: /what will be blessed/i })
      await user.click(screen.getByRole('radio', { name: /vehicle/i }))
      await user.type(screen.getByLabelText(/owner's full name/i), 'Aling Rosa')
      await user.type(screen.getByLabelText(/plate number/i), 'NBC 1234')
      await user.click(screen.getByRole('button', { name: /continue/i }))

      const submit = await screen.findByRole('button', { name: /submit booking/i })
      await waitFor(() => expect(submit).toBeEnabled())
      await user.click(submit)
      expect(await screen.findByText('Result page')).toBeInTheDocument()
      expect(createWalkIn).toHaveBeenCalledWith('house-blessing', expect.objectContaining({ appointmentDate: slot, appointmentStart: '09:00' }))
      expect(submitWalkIn).toHaveBeenCalledWith('w1', { waiveLeadTime: false, waiveReason: '' })
    })

    it('clears the chosen slot when the waiver is switched off again', async () => {
      const user = userEvent.setup()
      useDeskStore.getState().setWaiver(true, 'Urgent')
      renderDesk('/desk/house-blessing/1')
      await user.click(await screen.findByRole('checkbox', { name: /waive the lead-time rule/i }))
      expect(useBookingStore.getState().appointmentDate).toBeNull()
      expect(useDeskStore.getState().waiveLeadTime).toBe(false)
    })

    it('is not shown to a parishioner booking online', async () => {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={['/booking/house-blessing/1']}>
            <Routes><Route path="/booking/:sacrament/:step" element={<BookingWizard />} /></Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      )
      await screen.findByRole('heading', { name: /choose a date and time/i })
      expect(screen.queryByRole('checkbox', { name: /waive the lead-time rule/i })).not.toBeInTheDocument()
    })
  })

  describe('review and submit', () => {
    const readyToReview = () => {
      useBookingStore.getState().startBooking('house-blessing')
      useBookingStore.getState().updateFormData({ bookingFor: 'other', relationship: 'relative', propertyType: 'vehicle', propertyOwner: 'Aling Rosa', vehiclePlate: 'NBC 1234' })
      useBookingStore.getState().setAppointment(slot, '10:00')
      useDeskStore.getState().setContact({ fullName: 'Aling Rosa Dela Cruz', phone: '09171234567', email: 'maria@example.com' })
      useDeskStore.getState().setLinkedAccount({ id: 'acct-1', fullName: 'Maria Santos', email: 'maria@example.com' })
      useDeskStore.getState().setWaiver(true, 'Moving in tomorrow')
      createWalkIn.mockResolvedValue({ id: 'w1', amountDueCentavos: 0, paymentStatus: 'not_required' })
      updateWalkIn.mockResolvedValue({ id: 'w1', amountDueCentavos: 0, paymentStatus: 'not_required' })
      submitWalkIn.mockResolvedValue({ id: 'w1', status: 'submitted', paymentStatus: 'not_required' })
    }

    it('shows the contact, the link and the waiver, then submits through the walk-in endpoints', async () => {
      const user = userEvent.setup()
      readyToReview()
      renderDesk('/desk/house-blessing/4')

      expect(await screen.findByText('Aling Rosa Dela Cruz')).toBeInTheDocument()
      expect(screen.getByText('09171234567')).toBeInTheDocument()
      expect(screen.getByText(/linked to maria santos/i)).toBeInTheDocument()
      expect(screen.getByText(/moving in tomorrow/i)).toBeInTheDocument()

      const submit = await screen.findByRole('button', { name: /submit booking/i })
      await waitFor(() => expect(submit).toBeEnabled())
      await user.click(submit)

      expect(await screen.findByText('Result page')).toBeInTheDocument()
      expect(createWalkIn).toHaveBeenCalledTimes(1)
      expect(createWalkIn).toHaveBeenCalledWith('house-blessing', {
        contact: { fullName: 'Aling Rosa Dela Cruz', phone: '09171234567', email: 'maria@example.com', relationship: 'relative' },
        linkUserId: 'acct-1',
        formData: expect.objectContaining({ propertyOwner: 'Aling Rosa', relationship: 'relative' }),
        appointmentDate: slot,
        appointmentStart: '10:00',
      })
      expect(submitWalkIn).toHaveBeenCalledWith('w1', { waiveLeadTime: true, waiveReason: 'Moving in tomorrow' })
    })

    it('will not submit without a contact, or a waiver without a reason', async () => {
      readyToReview()
      useDeskStore.getState().setContact(null)
      useDeskStore.getState().setWaiver(true, '  ')
      renderDesk('/desk/house-blessing/4')
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(/enter the walk-in contact/i)
      expect(alert).toHaveTextContent(/give a reason for waiving the lead time/i)
      expect(screen.getByRole('button', { name: /submit booking/i })).toBeDisabled()
      expect(createWalkIn).not.toHaveBeenCalled()
    })

    it('opens the contact step when the server refuses the phone number', async () => {
      const user = userEvent.setup()
      readyToReview()
      submitWalkIn.mockRejectedValue(new ApiError('The contact.phone field format is invalid.', 422, { 'contact.phone': ['The contact.phone field format is invalid.'] }))
      renderDesk('/desk/house-blessing/4')
      const submit = await screen.findByRole('button', { name: /submit booking/i })
      await waitFor(() => expect(submit).toBeEnabled())
      await user.click(submit)
      expect(await screen.findByRole('heading', { name: /who is at the counter/i })).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent(/contact\.phone field format is invalid/i)
    })

    it('says a QR code follows when a fee is due', async () => {
      readyToReview()
      createWalkIn.mockResolvedValue({ id: 'w1', amountDueCentavos: 500000, paymentStatus: 'unpaid' })
      updateWalkIn.mockResolvedValue({ id: 'w1', amountDueCentavos: 500000, paymentStatus: 'unpaid' })
      renderDesk('/desk/house-blessing/4')
      expect(await screen.findByRole('button', { name: /submit & show gcash qr/i })).toBeInTheDocument()
      expect(screen.getByText('₱5,000.00')).toBeInTheDocument()
    })
  })
})
