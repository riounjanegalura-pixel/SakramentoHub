import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingDetailScreen } from './BookingDetailScreen'
import { useBookingStore } from '../../stores/booking-store'
import { setViewport } from '../../test/viewport'
import { fetchAvailabilityDays } from '../../lib/data/availability'
import { addDaysYmd, parishToday } from '../../lib/domain'
import type { Booking } from '../../lib/types'
import { expectNoA11yViolations } from '../../test/a11y'

const base: Booking = {
  id: 'b1', referenceNumber: 'FUNE-20261102-AB12', userId: 'u1', sacrament: 'funeral', status: 'approved',
  statusLabel: 'Approved', formData: { deceasedFirstName: 'Lorenzo', deceasedLastName: 'Pascual', massType: 'church' },
  appointmentDate: '2030-01-08', appointmentStart: '10:00', appointmentEnd: '11:00', isEmergency: false,
  paymentStatus: 'not_required', amountDueCentavos: 0, paymentHoldExpiresAt: null, paidAt: null, paymentReference: null,
  refundReference: null, refundedAt: null, statusReason: null, returnNote: null, createdAt: '2026-11-02T00:00:00Z',
}

const fetchBooking = vi.fn()
const cancelBooking = vi.fn()
const rescheduleBooking = vi.fn()
const fetchCertificateHtml = vi.fn()
const attachLateDocument = vi.fn()
const uploadDocument = vi.fn()
const fetchDayAvailability = vi.fn()
vi.mock('../../lib/data/bookings', () => ({
  fetchBooking: (...a: unknown[]) => fetchBooking(...a),
  cancelBooking: (...a: unknown[]) => cancelBooking(...a),
  rescheduleBooking: (...a: unknown[]) => rescheduleBooking(...a),
  fetchCertificateHtml: (...a: unknown[]) => fetchCertificateHtml(...a),
  attachLateDocument: (...a: unknown[]) => attachLateDocument(...a),
}))
vi.mock('../../lib/data/documents', () => ({ uploadDocument: (...a: unknown[]) => uploadDocument(...a) }))
vi.mock('../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))
vi.mock('../../lib/data/availability', () => ({
  fetchAvailabilityDays: vi.fn(async () => []),
  fetchDayAvailability: (...a: unknown[]) => fetchDayAvailability(...a),
}))

function renderDetail() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/booking/history/b1']}>
        <Routes>
          <Route path="/booking/history/:id" element={<BookingDetailScreen />} />
          <Route path="/booking/:sacrament/:step" element={<p>Wizard page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BookingDetailScreen', () => {
  beforeEach(() => {
    fetchBooking.mockReset()
    cancelBooking.mockReset()
    rescheduleBooking.mockReset()
    fetchCertificateHtml.mockReset()
    fetchCertificateHtml.mockRejectedValue(new Error('none'))
    fetchDayAvailability.mockReset()
    fetchDayAvailability.mockImplementation(async (_s: string, date: string) => ({ date, status: 'free', reason: null, freeStarts: ['09:00'] }))
    useBookingStore.getState().reset()
  })

  it('shows the reference, schedule and the answers given', async () => {
    fetchBooking.mockResolvedValue(base)
    renderDetail()
    expect(await screen.findByText('FUNE-20261102-AB12')).toBeInTheDocument()
    expect(screen.getByText(/tue, jan 8, 2030 · 10:00 am/i)).toBeInTheDocument()
    expect(screen.getByText('Lorenzo Pascual')).toBeInTheDocument()
  })

  it('lets a returned booking be updated and resubmitted', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'returned', statusLabel: 'Needs changes', returnNote: 'Re-upload the death certificate' })
    renderDetail()
    expect(await screen.findByText('Re-upload the death certificate')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /update and resubmit/i }))

    expect(await screen.findByText('Wizard page')).toBeInTheDocument()
    expect(useBookingStore.getState().editingBookingId).toBe('b1')
    expect(useBookingStore.getState().formData.deceasedFirstName).toBe('Lorenzo')
    expect(useBookingStore.getState().appointmentStart).toBe('10:00')
  })

  it('cancels with a reason', async () => {
    fetchBooking.mockResolvedValue(base)
    cancelBooking.mockResolvedValue({ ...base, status: 'cancelled', statusLabel: 'Cancelled' })
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: /cancel booking/i }))
    await userEvent.type(screen.getByLabelText(/reason/i), 'Family decided on another date')
    await userEvent.click(screen.getByRole('button', { name: /yes, cancel/i }))
    expect(cancelBooking).toHaveBeenCalledWith('b1', 'Family decided on another date')
  })

  it('cancelling a booking paid in cash says the office will return the cash, not GCash', async () => {
    fetchBooking.mockResolvedValue({ ...base, sacrament: 'wedding', paymentStatus: 'paid', paymentMethod: 'cash', amountDueCentavos: 500000 })
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: /cancel booking/i }))
    expect(await screen.findByText('You already paid in cash, so the parish office will return your cash payment.')).toBeInTheDocument()
    expect(screen.queryByText(/gcash payment/i)).not.toBeInTheDocument()
  })

  it('cancelling a booking paid by GCash still says the GCash payment is refunded', async () => {
    fetchBooking.mockResolvedValue({ ...base, sacrament: 'wedding', paymentStatus: 'paid', paymentMethod: 'gcash', amountDueCentavos: 500000 })
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: /cancel booking/i }))
    expect(await screen.findByText('You already paid, so the parish office will refund your GCash payment.')).toBeInTheDocument()
  })

  it('a refund due on a cash payment says the office will return the cash', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'cancelled', statusLabel: 'Cancelled', paymentStatus: 'refund_due', paymentMethod: 'cash', amountDueCentavos: 500000 })
    renderDetail()
    expect(await screen.findByText('The parish office will return your cash payment.')).toBeInTheDocument()
    expect(screen.queryByText(/refund your gcash/i)).not.toBeInTheDocument()
  })

  it('shows the payment receipt once paid', async () => {
    fetchBooking.mockResolvedValueOnce({ ...base, sacrament: 'wedding', status: 'submitted', paymentStatus: 'paid', amountDueCentavos: 500000, paidAt: '2026-11-02T03:00:00Z', paymentReference: 'pay_abc123' })
    renderDetail()
    expect(await screen.findByText(/pay_abc123/)).toBeInTheDocument()
    expect(screen.getByText('₱5,000.00')).toBeInTheDocument()
  })

  it('offers the GCash payment while an unpaid hold is still open', async () => {
    const holdEnds = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    fetchBooking.mockResolvedValue({ ...base, sacrament: 'wedding', status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 500000, paymentHoldExpiresAt: holdEnds })
    renderDetail()
    expect(await screen.findByText(/pay by .* or the slot is released/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /pay with gcash/i }))
    expect(await screen.findByText('Wizard page')).toBeInTheDocument()
  })

  it('shows a booking waiting for cash as not paid yet, with the deadline and a way to the instructions', async () => {
    const holdEnds = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    fetchBooking.mockResolvedValue({ ...base, sacrament: 'wedding', status: 'submitted', paymentStatus: 'pending_cash', paymentMethod: 'cash', amountDueCentavos: 500000, paymentHoldExpiresAt: holdEnds })
    renderDetail()
    expect(await screen.findByText('Cash at the parish office')).toBeInTheDocument()
    expect(screen.getByText(/not paid yet\. bring the cash to the parish office by .* or the slot is released/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pay with gcash/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'What to bring and where' }))
    expect(await screen.findByText('Wizard page')).toBeInTheDocument()
  })

  it('shows cash recorded by the office with its receipt number', async () => {
    fetchBooking.mockResolvedValue({ ...base, sacrament: 'wedding', status: 'submitted', paymentStatus: 'paid', paymentMethod: 'cash', cashReceiptReference: 'OR-0042', amountDueCentavos: 500000, paidAt: '2026-11-02T03:00:00Z', paymentReference: null })
    renderDetail()
    expect(await screen.findByText(/paid in cash at the parish office .* · receipt OR-0042/i)).toBeInTheDocument()
    expect(screen.queryByText(/ref null/i)).not.toBeInTheDocument()
  })

  it('does not offer payment once the hold has expired', async () => {
    fetchBooking.mockResolvedValue({ ...base, sacrament: 'wedding', status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 500000, paymentHoldExpiresAt: '2020-01-01T00:00:00Z' })
    renderDetail()
    expect(await screen.findByText(/payment window closed — this booking will be cancelled/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pay with gcash/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/pay by/i)).not.toBeInTheDocument()
  })

  it('shows the paid time in parish (Manila) time', async () => {
    fetchBooking.mockResolvedValue({ ...base, sacrament: 'wedding', status: 'submitted', paymentStatus: 'paid', amountDueCentavos: 500000, paidAt: '2026-11-02T03:00:00Z', paymentReference: 'pay_abc123' })
    // A device outside the Philippines: 03:00 UTC is 10:00 PM there but 11:00 AM in Manila.
    const deviceTz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      renderDetail()
      expect(await screen.findByText(/11:00\sam/i)).toBeInTheDocument()
    } finally {
      if (deviceTz === undefined) delete process.env.TZ
      else process.env.TZ = deviceTz
    }
  })

  it.each(['submitted', 'approved'] as const)('offers rescheduling for a %s booking', async (status) => {
    fetchBooking.mockResolvedValue({ ...base, status })
    renderDetail()
    expect(await screen.findByRole('button', { name: /^reschedule$/i })).toBeInTheDocument()
  })

  it('does not offer rescheduling for a completed booking', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'completed', statusLabel: 'Completed' })
    renderDetail()
    await screen.findByText('FUNE-20261102-AB12')
    expect(screen.queryByRole('button', { name: /^reschedule$/i })).not.toBeInTheDocument()
  })

  it('reschedules to the picked date and time, noting an approved booking is reviewed again', async () => {
    fetchBooking.mockResolvedValue(base)
    rescheduleBooking.mockResolvedValue({ ...base, status: 'submitted' })
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: /^reschedule$/i }))
    expect(screen.getByText(/the parish will review the new schedule again/i)).toBeInTheDocument()

    const days = (await screen.findAllByRole('button', { name: /\d{4}/ })).filter((b) => !b.hasAttribute('disabled'))
    await userEvent.click(days[days.length - 1])
    await userEvent.click(await screen.findByRole('radio', { name: '9:00 AM' }))
    await userEvent.click(screen.getByRole('button', { name: /confirm new schedule/i }))

    await waitFor(() => expect(rescheduleBooking).toHaveBeenCalledWith('b1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), '09:00'))
  })

  it('shows why a reschedule failed', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'submitted' })
    rescheduleBooking.mockRejectedValue(new Error('That time was just taken. Please pick another.'))
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: /^reschedule$/i }))
    expect(screen.queryByText(/review the new schedule again/i)).not.toBeInTheDocument()

    const days = (await screen.findAllByRole('button', { name: /\d{4}/ })).filter((b) => !b.hasAttribute('disabled'))
    await userEvent.click(days[days.length - 1])
    await userEvent.click(await screen.findByRole('radio', { name: '9:00 AM' }))
    await userEvent.click(screen.getByRole('button', { name: /confirm new schedule/i }))

    expect(await screen.findByText('That time was just taken. Please pick another.')).toBeInTheDocument()
  })

  it('shows the reason a booking was declined', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'declined', statusLabel: 'Declined', statusReason: 'The requested date is a parish holiday.' })
    renderDetail()
    expect(await screen.findByText(/reason it was declined/i)).toBeInTheDocument()
    expect(screen.getByText('The requested date is a parish holiday.')).toBeInTheDocument()
  })

  it('does not offer to cancel a booking that is already cancelled', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'cancelled', statusLabel: 'Cancelled', statusReason: 'Moved away' })
    renderDetail()
    expect(await screen.findByText('Moved away')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel booking/i })).not.toBeInTheDocument()
  })

  it('sends an approved booking within 3 days to the parish office instead of cancelling', async () => {
    fetchBooking.mockResolvedValue({ ...base, appointmentDate: addDaysYmd(parishToday(), 2) })
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: /cancel booking/i }))
    expect(await screen.findByText(/please call the parish office at 09123456789/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /yes, cancel/i })).not.toBeInTheDocument()
  })

  const entry = (status: 'valid' | 'revoked' = 'valid') => ({ id: 'r1', registerNumber: 'BAP-2026-0007', status, enteredAt: '2026-10-05T00:00:00Z' })

  it('lets a completed booking open its issued certificate', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'completed', statusLabel: 'Completed', registerEntry: entry() })
    fetchCertificateHtml.mockResolvedValue('<html>Certificate</html>')
    renderDetail()
    expect(await screen.findByRole('button', { name: /view certificate/i })).toBeInTheDocument()
    expect(fetchCertificateHtml).toHaveBeenCalledWith('b1')
  })

  it('labels the certificate button with the register number', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'completed', statusLabel: 'Completed', registerEntry: entry() })
    fetchCertificateHtml.mockResolvedValue('<html>Certificate</html>')
    renderDetail()
    expect(await screen.findByRole('button', { name: 'View certificate BAP-2026-0007' })).toBeInTheDocument()
  })

  it('notes a withdrawn certificate and still shows the button', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'completed', statusLabel: 'Completed', registerEntry: entry('revoked') })
    fetchCertificateHtml.mockResolvedValue('<html>Certificate</html>')
    renderDetail()
    expect(await screen.findByRole('button', { name: /view certificate bap-2026-0007/i })).toBeInTheDocument()
    expect(screen.getByText(/parish office withdrew this certificate/i)).toBeInTheDocument()
  })

  it('shows no certificate button for a completed booking without a register entry', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'completed', statusLabel: 'Completed', registerEntry: null })
    fetchCertificateHtml.mockResolvedValue('<html>Certificate</html>')
    renderDetail()
    expect(await screen.findByText(/hasn.t issued it yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view certificate/i })).not.toBeInTheDocument()
  })

  it('says the certificate is not issued yet when there is none', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'completed', statusLabel: 'Completed' })
    renderDetail()
    expect(await screen.findByText(/hasn.t issued it yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view certificate/i })).not.toBeInTheDocument()
  })

  it('has no certificate section before the booking is completed', async () => {
    fetchBooking.mockResolvedValue(base)
    renderDetail()
    await screen.findByText('FUNE-20261102-AB12')
    expect(screen.queryByText('Certificate')).not.toBeInTheDocument()
    expect(fetchCertificateHtml).not.toHaveBeenCalled()
  })

  it("passes the booking's own id to the date picker and the day lookup so it does not block its own slot", async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'submitted' })
    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: /^reschedule$/i }))

    await waitFor(() => expect(fetchAvailabilityDays).toHaveBeenCalled())
    expect(vi.mocked(fetchAvailabilityDays).mock.calls[0][4]).toBe('b1')

    const days = (await screen.findAllByRole('button', { name: /\d{4}/ })).filter((b) => !b.hasAttribute('disabled'))
    await userEvent.click(days[days.length - 1])
    await waitFor(() => expect(fetchDayAvailability).toHaveBeenCalled())
    expect(fetchDayAvailability.mock.calls[0][3]).toBe('b1')
  })

  it('sends an approved booking within 3 days to the parish office instead of offering to reschedule', async () => {
    fetchBooking.mockResolvedValue({ ...base, appointmentDate: addDaysYmd(parishToday(), 2) })
    renderDetail()
    expect(await screen.findByText(/rescheduled here until 3 days before the date/i)).toBeInTheDocument()
    expect(await screen.findByText(/contact the parish office at 09123456789/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^reschedule$/i })).not.toBeInTheDocument()
  })

  it('still offers rescheduling exactly 3 days out, and for a submitted booking inside 3 days', async () => {
    fetchBooking.mockResolvedValue({ ...base, appointmentDate: addDaysYmd(parishToday(), 3) })
    const first = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/booking/history/b1']}>
          <Routes><Route path="/booking/history/:id" element={<BookingDetailScreen />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('button', { name: /^reschedule$/i })).toBeInTheDocument()
    first.unmount()

    fetchBooking.mockResolvedValue({ ...base, status: 'submitted', appointmentDate: addDaysYmd(parishToday(), 1) })
    renderDetail()
    expect(await screen.findByRole('button', { name: /^reschedule$/i })).toBeInTheDocument()
  })

  it('notices by itself when the payment hold runs out, and re-checks the booking', async () => {
    const holdEnds = new Date(Date.now() + 1200).toISOString()
    fetchBooking.mockResolvedValue({ ...base, sacrament: 'wedding', status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 500000, paymentHoldExpiresAt: holdEnds })
    renderDetail()
    expect(await screen.findByRole('button', { name: /pay with gcash/i })).toBeInTheDocument()
    expect(fetchBooking).toHaveBeenCalledTimes(1)

    expect(await screen.findByText(/payment window closed — this booking will be cancelled/i, {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pay with gcash/i })).not.toBeInTheDocument()
    await waitFor(() => expect(fetchBooking).toHaveBeenCalledTimes(2))
  })

  const docs = (over: Array<Partial<NonNullable<Booking['documents']>[number]>> = [{}]) =>
    over.map((o, i) => ({ key: `doc${i}`, label: `death certificate${i ? ` ${i}` : ''}`, required: true, url: `/documents/u1/f${i}.pdf`, review: null, ...o }))

  it('shows an accepted document with a tick', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'submitted', documents: docs([{ review: { status: 'accepted', note: null, reviewedAt: '2026-11-02T01:00:00Z' } }]) })
    renderDetail()
    const card = within(await screen.findByRole('region', { name: /documents/i }))
    expect(card.getByText('death certificate')).toBeInTheDocument()
    expect(card.getByText('Accepted')).toBeInTheDocument()
  })

  it('shows a rejected document with the staff note and a way to upload a new file once returned', async () => {
    fetchBooking.mockResolvedValue({
      ...base, status: 'returned', returnNote: 'Please replace the documents marked as rejected.',
      documents: docs([{ review: { status: 'rejected', note: 'Blurry — please re-upload', reviewedAt: '2026-11-02T01:00:00Z' } }]),
    })
    renderDetail()
    expect(await screen.findByText(/needs a new file/i)).toBeInTheDocument()
    expect(screen.getByText(/blurry — please re-upload/i)).toBeInTheDocument()

    expect(screen.getByLabelText(/replace file: death certificate/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /review and send it back/i }))
    expect(await screen.findByText('Wizard page')).toBeInTheDocument()
    expect(useBookingStore.getState().editingBookingId).toBe('b1')
  })

  it('replaces just the document the office sent back, right on the booking, and shows it waiting for review', async () => {
    fetchBooking.mockResolvedValue({
      ...base, status: 'returned',
      documents: docs([{ review: { status: 'rejected', note: 'Blurry', reviewedAt: '2026-11-02T01:00:00Z' } }, { label: 'marriage contract', review: { status: 'accepted', note: null, reviewedAt: '2026-11-02T01:00:00Z' } }]),
    })
    uploadDocument.mockResolvedValue({ url: '/documents/u1/new.pdf' })
    attachLateDocument.mockResolvedValue({
      ...base, status: 'returned',
      documents: docs([{ url: '/documents/u1/new.pdf', review: null }, { label: 'marriage contract', review: { status: 'accepted', note: null, reviewedAt: '2026-11-02T01:00:00Z' } }]),
    })
    renderDetail()

    const file = new File(['x'], 'new.pdf', { type: 'application/pdf' })
    await userEvent.upload(await screen.findByLabelText(/replace file: death certificate/i), file)

    await waitFor(() => expect(attachLateDocument).toHaveBeenCalledWith('b1', 'doc0', '/documents/u1/new.pdf'))
    expect(await screen.findByText('Waiting for review')).toBeInTheDocument()
    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(screen.queryByText(/needs a new file/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/replace file/i)).not.toBeInTheDocument()
  })

  it('shows the real reason when the replacement is refused', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'returned', documents: docs([{ review: { status: 'rejected', note: 'Blurry', reviewedAt: '2026-11-02T01:00:00Z' } }]) })
    uploadDocument.mockResolvedValue({ url: '/documents/u1/new.pdf' })
    attachLateDocument.mockRejectedValue(new Error('A document can be replaced only while the booking is still open.'))
    renderDetail()

    await userEvent.upload(await screen.findByLabelText(/replace file/i), new File(['x'], 'new.pdf', { type: 'application/pdf' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('only while the booking is still open')
  })

  it('offers no replace button on a document that is accepted, waiting, or on a closed booking', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'completed', documents: docs([{ review: { status: 'rejected', note: 'Blurry', reviewedAt: '2026-11-02T01:00:00Z' } }]) })
    renderDetail()
    await screen.findByText(/needs a new file/i)
    expect(screen.queryByLabelText(/replace file/i)).not.toBeInTheDocument()
  })

  it('tells the parishioner the office will ask for a new file when a document is rejected on a booking still under review', async () => {
    fetchBooking.mockResolvedValue({
      ...base, status: 'submitted',
      documents: docs([{ review: { status: 'rejected', note: 'Blurry', reviewedAt: '2026-11-02T01:00:00Z' } }]),
    })
    renderDetail()
    expect(await screen.findByText(/needs a new file/i)).toBeInTheDocument()
    // Still under review: the person can replace the file right away, without being asked first.
    expect(screen.getByLabelText(/replace file: death certificate/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /review and send it back/i })).not.toBeInTheDocument()
  })

  it('shows waiting-for-review and not-uploaded documents', async () => {
    fetchBooking.mockResolvedValue({ ...base, status: 'submitted', documents: docs([{}, { url: null, required: false }]) })
    renderDetail()
    const card = within(await screen.findByRole('region', { name: /documents/i }))
    expect(card.getByText('Waiting for review')).toBeInTheDocument()
    expect(card.getByText('Not uploaded')).toBeInTheDocument()
    expect(card.getByText(/\(optional\)/i)).toBeInTheDocument()
  })

  it('has no Documents card when the booking carries none', async () => {
    fetchBooking.mockResolvedValue(base)
    renderDetail()
    await screen.findByText('FUNE-20261102-AB12')
    expect(screen.queryByRole('heading', { name: /documents/i })).not.toBeInTheDocument()
  })

  it('shows the wedding preparation card and the day pass on an approved wedding, and neither on a funeral', async () => {
    const m = { key: 'submitted', label: 'Booking submitted', done: true, state: 'done' as const, source: 'auto' as const, dueDate: null, gating: false, manual: false, note: null, doneAt: null, data: null }
    fetchBooking.mockResolvedValue({
      ...base, sacrament: 'wedding', milestones: [m, { ...m, key: 'approved', label: 'Booking approved' }],
      dayPass: { url: 'https://x/y', qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }, checkedInAt: null,
    })
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Wedding preparation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Day pass' })).toBeInTheDocument()
  })

  it('shows neither card on a funeral', async () => {
    fetchBooking.mockResolvedValue({ ...base, milestones: [], dayPass: null })
    renderDetail()
    await screen.findByText('FUNE-20261102-AB12')
    expect(screen.queryByRole('heading', { name: 'Wedding preparation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Day pass' })).not.toBeInTheDocument()
  })

  describe('day pass and preparation placement', () => {
    const m = { key: 'submitted', label: 'Booking submitted', done: true, state: 'done' as const, source: 'auto' as const, dueDate: null, gating: false, manual: false, note: null, doneAt: null, data: null }
    const wedding = (extra: Partial<Booking> = {}) => ({
      ...base, sacrament: 'wedding', milestones: [m, { ...m, key: 'approved', label: 'Booking approved' }],
      dayPass: { url: 'https://x/y', qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }, checkedInAt: null, ...extra,
    })
    const originalMatchMedia = window.matchMedia
    afterEach(() => { window.matchMedia = originalMatchMedia })

    it('on a desktop, holds the day pass and preparation in a side aside, apart from status, answers and actions', async () => {
      setViewport(1280)
      fetchBooking.mockResolvedValue(wedding())
      renderDetail()
      const aside = await screen.findByRole('complementary', { name: 'Day pass and preparation' })
      expect(within(aside).getByRole('heading', { name: 'Day pass' })).toBeInTheDocument()
      expect(within(aside).getByRole('heading', { name: 'Wedding preparation' })).toBeInTheDocument()
      expect(within(aside).queryByText('Your answers')).not.toBeInTheDocument()
      expect(within(aside).queryByText('Approved')).not.toBeInTheDocument()
      expect(within(aside).queryByRole('button', { name: /cancel booking/i })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel booking/i })).toBeInTheDocument()
      expect(screen.getByText('Approved')).toBeInTheDocument()
      expect(screen.getByText('Your answers')).toBeInTheDocument()
    })

    it('on a phone, has no such aside and puts the day pass after the return note', async () => {
      setViewport(390)
      fetchBooking.mockResolvedValue(wedding({ status: 'returned', statusLabel: 'Needs changes', returnNote: 'Re-upload the license' }))
      renderDetail()
      const resubmit = await screen.findByRole('button', { name: /update and resubmit/i })
      expect(screen.queryByRole('complementary', { name: 'Day pass and preparation' })).not.toBeInTheDocument()
      const dayPass = screen.getByRole('heading', { name: 'Day pass' })
      expect(resubmit.compareDocumentPosition(dayPass) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      const cancel = screen.getByRole('button', { name: /cancel booking/i })
      expect(dayPass.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  describe('journey rail', () => {
    const originalMatchMedia = window.matchMedia
    afterEach(() => { window.matchMedia = originalMatchMedia })

    it('comes after the status and date, then the reference in selectable mono', async () => {
      setViewport(390)
      fetchBooking.mockResolvedValue(base)
      const { container } = renderDetail()
      const rail = await screen.findByRole('list', { name: 'Booking progress' })
      const ref = screen.getByText('FUNE-20261102-AB12')
      expect(ref.className).toMatch(/font-mono/)
      expect(ref.className).toMatch(/select-all/)
      const schedule = screen.getByText(/tue, jan 8, 2030 · 10:00 am/i)
      expect(schedule.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(rail.compareDocumentPosition(ref) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(within(rail).getByText('Confirmed').closest('li')).toHaveAttribute('aria-current', 'step')
      expect(within(rail).getByText('Current step')).toBeInTheDocument()
      await expectNoA11yViolations(container)
    })

    it('shows a no-fee booking as "No payment needed", done', async () => {
      fetchBooking.mockResolvedValue(base)
      renderDetail()
      const rail = await screen.findByRole('list', { name: 'Booking progress' })
      const paid = within(rail).getByText('No payment needed').closest('li')!
      expect(paid.querySelector('[data-node="done"]')).not.toBeNull()
    })

    it('keeps a returned booking under review with "Changes requested"', async () => {
      fetchBooking.mockResolvedValue({ ...base, status: 'returned', statusLabel: 'Needs changes', returnNote: 'Re-upload the death certificate' })
      renderDetail()
      const rail = await screen.findByRole('list', { name: 'Booking progress' })
      const review = within(rail).getByText('Under review').closest('li')!
      expect(review).toHaveAttribute('aria-current', 'step')
      expect(within(review).getByText('Changes requested')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /update and resubmit/i })).toBeInTheDocument()
    })

    it('ends a declined booking with a labelled Declined row and no current step', async () => {
      fetchBooking.mockResolvedValue({ ...base, status: 'declined', statusLabel: 'Declined', statusReason: 'Date unavailable' })
      renderDetail()
      const rail = await screen.findByRole('list', { name: 'Booking progress' })
      const declined = within(rail).getByText('Declined').closest('li')!
      expect(declined.querySelector('[data-node="danger"] svg')).not.toBeNull()
      expect(within(rail).queryByText('Current step')).not.toBeInTheDocument()
      expect(screen.getByText('Date unavailable')).toBeInTheDocument()
    })

    it('shows a refund row on a cancelled paid booking', async () => {
      fetchBooking.mockResolvedValue({ ...base, status: 'cancelled', statusLabel: 'Cancelled', paymentStatus: 'refund_due', amountDueCentavos: 500000 })
      renderDetail()
      const rail = await screen.findByRole('list', { name: 'Booking progress' })
      expect(within(rail).getByText('Cancelled')).toBeInTheDocument()
      expect(within(rail).getByText('Refund due')).toBeInTheDocument()
    })

    it('on a desktop, puts the rail in the left column and the details on the right', async () => {
      setViewport(1280)
      fetchBooking.mockResolvedValue(base)
      const { container } = renderDetail()
      const rail = await screen.findByRole('list', { name: 'Booking progress' })
      const left = container.querySelector('[data-column="journey"]')!
      const right = container.querySelector('[data-column="details"]')!
      expect(left).toContainElement(rail)
      expect(right).toContainElement(screen.getByText('Your answers'))
      expect(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      await expectNoA11yViolations(container)
    })

    it('keeps the primary action gold with navy text', async () => {
      const holdEnds = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
      fetchBooking.mockResolvedValue({ ...base, sacrament: 'wedding', status: 'submitted', paymentStatus: 'unpaid', amountDueCentavos: 500000, paymentHoldExpiresAt: holdEnds })
      renderDetail()
      const pay = await screen.findByRole('button', { name: /pay with gcash/i })
      expect(pay).toHaveClass('bg-gold', 'text-navy')
      expect(within(screen.getByRole('list', { name: 'Booking progress' })).getByText('Payment due')).toBeInTheDocument()
    })
  })

  it('shows a loading status, then a plain error with Try again when the booking cannot load', async () => {
    let reject!: (e: Error) => void
    fetchBooking.mockReturnValue(new Promise((_r, j) => { reject = j }))
    renderDetail()
    expect(screen.getByText('Loading your booking…')).toBeInTheDocument()
    reject(new Error('Not found'))
    expect(await screen.findByText(/couldn.t load this booking\. check your connection/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Booking progress' })).not.toBeInTheDocument()
  })
})
