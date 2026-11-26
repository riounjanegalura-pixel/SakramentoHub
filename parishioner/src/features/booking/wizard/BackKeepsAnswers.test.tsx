import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { BookingWizard } from './BookingWizard'
import { useAuthStore } from '../../../stores/auth-store'
import { useBookingStore } from '../../../stores/booking-store'
import { useDeskStore } from '../../../stores/desk-store'
import { addDaysYmd, parishToday } from '../../../lib/domain'
import { setViewport } from '../../../test/viewport'

vi.mock('../../../lib/data/availability', () => ({
  fetchAvailabilityDays: vi.fn(async () => []),
  fetchDayAvailability: vi.fn(async (_s: string, date: string) => ({ date, status: 'free', reason: null, freeStarts: ['09:00', '10:00'] })),
}))
vi.mock('../../../lib/data/services', () => ({
  fetchServices: vi.fn(async () => [
    { id: 'house-blessing', sessionTimes: null, durationMinutes: 45 },
    { id: 'funeral', sessionTimes: null, durationMinutes: 60 },
  ]),
}))
vi.mock('../../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))
vi.mock('../../../lib/data/documents', () => ({ uploadDocument: vi.fn(async () => ({ url: '/files/death-cert.pdf' })) }))
vi.mock('../../../lib/data/bookings', () => ({ saveDraft: vi.fn(), submitBooking: vi.fn(), updateDraft: vi.fn() }))
vi.mock('../../../lib/data/walkIns', () => ({
  lookupParishioner: vi.fn(),
  createWalkIn: vi.fn(),
  updateWalkIn: vi.fn(),
  submitWalkIn: vi.fn(),
  fetchDeskBooking: vi.fn(),
}))
vi.mock('../../../lib/data/useApi', () => ({ useApi: true }))

function LeaveProbe() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/services')}>
      Leave by route
    </button>
  )
}

function renderWizard(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <LeaveProbe />
        <Routes>
          <Route path="/booking/:sacrament/:step" element={<BookingWizard />} />
          <Route path="/desk/:sacrament/:step" element={<BookingWizard mode="desk" />} />
          <Route path="/services" element={<p>Services page</p>} />
          <Route path="/desk" element={<p>Desk home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const store = () => useBookingStore.getState()
const slot = addDaysYmd(parishToday(), 7)
const originalMatchMedia = window.matchMedia

describe('Back keeps the current step answers', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })
  beforeEach(() => {
    vi.clearAllMocks()
    store().reset()
    useDeskStore.getState().reset()
    useAuthStore.setState({
      user: { id: 'u1', fullName: 'Ricardo Dalisay', email: 'r@example.com', phone: '09170000000', address: '', emailVerifiedAt: '2026-01-01' },
      isBootstrapping: false,
    })
  })

  describe('house blessing', () => {
    beforeEach(() => {
      store().startBooking('house-blessing')
      store().updateFormData({ bookingFor: 'self' })
      // The schedule step (step 2) comes before the property step, so Back lands on a chosen slot.
      store().setAppointment(slot, '10:00')
    })

    it('a typed value is still there after Back and forward again', async () => {
      const user = userEvent.setup()
      renderWizard('/booking/house-blessing/3')
      await user.type(await screen.findByLabelText(/owner's full name/i), 'Maria Clara')
      await user.click(screen.getByRole('button', { name: 'Go back' }))
      await screen.findByRole('heading', { name: /who is this booking for/i })
      await user.click(screen.getByRole('button', { name: 'Next' }))
      expect(await screen.findByLabelText(/owner's full name/i)).toHaveValue('Maria Clara')
    })

    it('an invalid value survives Back and still blocks Continue with its error', async () => {
      const user = userEvent.setup()
      store().updateFormData({ propertyType: 'vehicle', propertyOwner: 'Ricardo Dalisay' })
      renderWizard('/booking/house-blessing/3')
      await user.type(await screen.findByLabelText(/plate number/i), 'A')
      await user.click(screen.getByRole('button', { name: 'Go back' }))
      await screen.findByRole('heading', { name: /who is this booking for/i })
      await user.click(screen.getByRole('button', { name: 'Next' }))
      expect(await screen.findByLabelText(/plate number/i)).toHaveValue('A')
      await user.click(screen.getByRole('button', { name: 'Next' }))
      expect((await screen.findAllByText(/Enter the plate number/)).length).toBeGreaterThan(0)
      expect(screen.queryByRole('heading', { name: /review your booking/i })).not.toBeInTheDocument()
    })

    it('leaving the step by route (browser Back) keeps the answers like the header Back', async () => {
      const user = userEvent.setup()
      renderWizard('/booking/house-blessing/3')
      await user.type(await screen.findByLabelText(/owner's full name/i), 'Maria Clara')
      await user.click(screen.getByRole('button', { name: 'Leave by route' }))
      expect(await screen.findByText('Services page')).toBeInTheDocument()
      expect(store().formData.propertyOwner).toBe('Maria Clara')
    })

    it('Discard draft throws the answers away and re-entering does not bring them back', async () => {
      const user = userEvent.setup()
      renderWizard('/booking/house-blessing/3')
      await user.type(await screen.findByLabelText(/owner's full name/i), 'Maria Clara')
      await user.click(screen.getByRole('button', { name: 'Discard draft' }))
      await user.click(await screen.findByRole('button', { name: 'Yes, discard' }))
      expect(await screen.findByText('Services page')).toBeInTheDocument()
      expect(store().formData).toEqual({})
      expect(store().formData.propertyOwner).toBeUndefined()
    })

    it('Review: Edit, change an answer, Back keeps the edit', async () => {
      store().updateFormData({ propertyType: 'vehicle', propertyOwner: 'Ricardo Dalisay', vehiclePlate: 'NBC 1234' })
      store().setAppointment(slot, '10:00')
      const user = userEvent.setup()
      renderWizard('/booking/house-blessing/4')
      const section = (await screen.findByRole('heading', { name: 'Property' })).closest('section') as HTMLElement
      await user.click(within(section).getByRole('button', { name: /edit/i }))
      const owner = await screen.findByLabelText(/owner's full name/i)
      await user.clear(owner)
      await user.type(owner, 'Maria Clara')
      await user.click(screen.getByRole('button', { name: 'Go back' }))
      expect(store().formData.propertyOwner).toBe('Maria Clara')
    })
  })

  describe('house blessing on a desktop', () => {
    it('jumping to Booking for from the step list keeps the typed answer', async () => {
      setViewport(1280)
      store().startBooking('house-blessing')
      store().updateFormData({ bookingFor: 'self' })
      store().setAppointment(slot, '10:00')
      const user = userEvent.setup()
      renderWizard('/booking/house-blessing/3')
      await user.type(await screen.findByLabelText(/owner's full name/i), 'Maria Clara')
      const steps = screen.getByRole('navigation', { name: 'Booking steps' })
      await user.click(within(steps).getByRole('button', { name: /Booking for/ }))
      expect(await screen.findByRole('heading', { name: /Booking for/, level: 1 })).toBeInTheDocument()
      await user.click(await screen.findByRole('button', { name: 'Next' }))
      expect(await screen.findByLabelText(/owner's full name/i)).toHaveValue('Maria Clara')
    })
  })

  describe('funeral', () => {
    beforeEach(() => {
      store().startBooking('funeral')
      store().updateFormData({ bookingFor: 'other', massType: 'church', burialCemetery: 'Memorial Park', burialDate: slot })
      store().setAppointment(slot, '10:00')
    })

    it('changing a schedule-affecting answer then Back drops the chosen appointment, as Continue does', async () => {
      const user = userEvent.setup()
      renderWizard('/booking/funeral/1')
      await user.click(await screen.findByRole('radio', { name: /house mass/i }))
      await user.click(screen.getByRole('button', { name: 'Go back' }))
      expect(store().formData.massType).toBe('house')
      expect(store().appointmentDate).toBeNull()
      expect(store().appointmentStart).toBeNull()
    })

    it('leaving a schedule answer alone keeps the appointment on Back', async () => {
      const user = userEvent.setup()
      renderWizard('/booking/funeral/1')
      await screen.findByRole('radio', { name: /house mass/i })
      await user.click(screen.getByRole('button', { name: 'Go back' }))
      expect(store().appointmentDate).toBe(slot)
    })

    it('an uploaded file on the Documents step survives Back', async () => {
      const user = userEvent.setup()
      renderWizard('/booking/funeral/5')
      const input = (await screen.findByLabelText(/death certificate/i, { selector: 'input' })) as HTMLInputElement
      await user.upload(input, new File(['x'], 'cert.pdf', { type: 'application/pdf' }))
      expect(await screen.findByText('cert.pdf')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Go back' }))
      expect(store().formData.deathCertificate).toBe('/files/death-cert.pdf')
    })
  })

  describe('office desk wizard', () => {
    it('keeps the phone frame and shows no step list on a desktop', async () => {
      setViewport(1280)
      useAuthStore.setState({
        user: { id: 's1', fullName: 'Staff User', email: 's@example.com', phone: '', address: '', emailVerifiedAt: '2026-01-01', role: 'staff' },
        isBootstrapping: false,
      })
      store().startBooking('house-blessing')
      renderWizard('/desk/house-blessing/3')
      await screen.findByLabelText(/owner's full name/i)
      expect(document.querySelector('[data-app-shell]')).not.toBeNull()
      expect(screen.queryByRole('navigation', { name: 'Booking steps' })).not.toBeInTheDocument()
    })

    beforeEach(() => {
      store().startBooking('house-blessing')
      useAuthStore.setState({
        user: { id: 's1', fullName: 'Staff User', email: 's@example.com', phone: '', address: '', emailVerifiedAt: '2026-01-01', role: 'staff' },
        isBootstrapping: false,
      })
    })

    it('keeps typed answers across Back, including an invalid walk-in contact', async () => {
      const user = userEvent.setup()
      store().updateFormData({ bookingFor: 'other', relationship: 'child', propertyType: 'vehicle', propertyOwner: 'A B', vehiclePlate: 'NBC 1234' })
      store().setAppointment(slot, '10:00')
      renderWizard('/desk/house-blessing/3')
      const owner = await screen.findByLabelText(/owner's full name/i)
      await user.clear(owner)
      await user.type(owner, 'Maria Clara')
      await user.click(screen.getByRole('button', { name: 'Go back' }))
      expect(store().formData.propertyOwner).toBe('Maria Clara')
      await user.type(await screen.findByLabelText(/full name/i), 'Juan Cruz')
      await user.type(screen.getByLabelText(/mobile number/i), '123')
      await user.click(screen.getByRole('button', { name: 'Go back' }))
      await screen.findByRole('heading', { name: /choose a date and time/i })
      expect(useDeskStore.getState().contact?.phone).toBe('123')
    })
  })
})
