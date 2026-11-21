import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { BookingDetailScreen } from './BookingDetailScreen'
import * as bookingsData from '../../lib/data/bookings'
import * as client from '../../lib/api/client'
import type { AdminBooking } from '../../lib/types'
import { adminBooking, bookingDocument, milestone, paginated } from '../../test/factories'
import { expectNoA11yViolations } from '../../test/a11y'

const makeBooking = (overrides: Partial<AdminBooking> = {}): AdminBooking =>
  adminBooking({ formData: { childFirstName: 'Baby', childLastName: 'Cruz' }, ...overrides })

function renderScreen(seed?: (c: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  seed?.(qc)
  return {
    client: qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/bookings/1']}>
          <Routes>
            <Route path="/bookings/:id" element={<BookingDetailScreen />} />
            <Route path="/bookings" element={<p>The queue</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

function stubPhone(on: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

describe('BookingDetailScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(bookingsData, 'fetchBookingNotes').mockResolvedValue([])
    vi.spyOn(bookingsData, 'fetchBookingHistory').mockResolvedValue([])
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-file-url'),
      revokeObjectURL: vi.fn(),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('puts the subject in the title, the reference and status beside it, and the decision first', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ subjectName: 'Baby Cruz', referenceNumber: 'BAPT-1', createdAt: '2026-11-01T02:00:00Z' }))
    renderScreen()
    expect(await screen.findByRole('heading', { level: 1, name: 'Baby Cruz' })).toBeInTheDocument()
    expect(screen.getByText('BAPT-1')).toHaveClass('font-mono')
    expect(screen.getByText(/Submitted Nov 1, 2026/)).toBeInTheDocument()
    const main = document.getElementById('main')!
    const regions = within(main).getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(regions[0]).toBe('Decision')
    expect(regions).toEqual(expect.arrayContaining(['Who and when', 'Payment']))
    expect(screen.getByRole('button', { name: /^Progress/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /^Notes and history/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows Approve and Decline for a submitted booking, with its form behind "Submitted details"', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ status: 'submitted' }))
    renderScreen()
    expect(await screen.findByRole('button', { name: 'Approve booking' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mark completed/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Child first name')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Submitted details/ }))
    // Inside it, each group is its own closed section with a one-line summary.
    expect(screen.queryByText('Child first name')).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: /^Child/ }))
    expect(await screen.findByText('Child first name')).toBeInTheDocument()
    expect(screen.getByText('Baby')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Submitted details/ }))
    await waitFor(() => expect(screen.queryByText('Baby')).not.toBeInTheDocument())
  })

  it('says there is no form data when none was recorded', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ formData: {} }))
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: /Submitted details/ }))
    expect(await screen.findByText('No form data recorded.')).toBeInTheDocument()
  })

  it('shows the appointment, a Call button for the owner phone and the return note', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(
      makeBooking({
        status: 'returned',
        appointmentDate: '2030-01-08',
        appointmentStart: '10:00',
        appointmentEnd: '11:00',
        user: { fullName: 'Juana Dela Cruz', email: 'juana@example.com', phone: '09171234567' },
        returnNote: 'Upload a clearer birth certificate',
      }),
    )
    renderScreen()
    expect(await screen.findByText('January 8, 10:00–11:00 AM')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call 0917 123 4567' })).toHaveAttribute('href', 'tel:09171234567')
    expect(screen.getByText(/Sent back for changes: Upload a clearer birth certificate/)).toBeInTheDocument()
    expect(screen.getAllByText('Needs changes').length).toBeGreaterThan(0)
  })

  it('shows an urgent request without an appointment time', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ isEmergency: true, sacrament: 'anointing' }))
    renderScreen()
    expect(await screen.findByText('Urgent: danger of death, no appointment time')).toBeInTheDocument()
  })

  it('shows Mark completed but not Approve/Decline for an approved booking', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ status: 'approved', appointmentDate: '2099-01-08', appointmentStart: '10:00', appointmentEnd: '11:00' }))
    renderScreen()
    expect(await screen.findByRole('button', { name: 'Mark completed' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('button', { name: 'Approve booking' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument()
  })

  it('shows the Register entry card for a completed booking, with no Generate button', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ status: 'completed', registerEntry: { id: 'r1', registerNumber: 'BAP-2026-0007', status: 'valid', enteredAt: '2026-03-14T02:00:00Z' } }))
    renderScreen()

    const card = within(await screen.findByRole('region', { name: 'Register entry' }))
    expect(card.getByText('BAP-2026-0007')).toBeInTheDocument()
    expect(card.getByText(/Mar 14, 2026/)).toBeInTheDocument()
    expect(card.getByText('Valid')).toBeInTheDocument()
    expect(card.getByRole('button', { name: 'View certificate' })).toBeInTheDocument()
    expect(card.getByRole('link', { name: 'Open in register' })).toHaveAttribute('href', '/register/r1')
    expect(screen.queryByRole('button', { name: /generate|regenerate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mark completed/i })).not.toBeInTheDocument()
  })

  it('shows a revoked register entry as revoked', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ status: 'completed', registerEntry: { id: 'r1', registerNumber: 'BAP-2026-0007', status: 'revoked', enteredAt: '2026-03-14T02:00:00Z' } }))
    renderScreen()
    expect(within(await screen.findByRole('region', { name: 'Register entry' })).getByText('Revoked')).toBeInTheDocument()
  })

  it('opens the certificate by booking through the authenticated loader', async () => {
    const html = vi.spyOn(bookingsData, 'fetchCertificateHtml').mockResolvedValue('<html>cert</html>')
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ status: 'completed', registerEntry: { id: 'r1', registerNumber: 'BAP-2026-0007', status: 'valid', enteredAt: '2026-03-14T02:00:00Z' } }))
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: 'View certificate' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('blob:mock-file-url', '_blank', 'noopener,noreferrer'))
    expect(html).toHaveBeenCalledWith('1')
  })

  it('shows the server message when the certificate cannot be opened', async () => {
    vi.spyOn(bookingsData, 'fetchCertificateHtml').mockRejectedValue(new Error('No certificate yet.'))
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ status: 'completed', registerEntry: { id: 'r1', registerNumber: 'BAP-2026-0007', status: 'valid', enteredAt: '2026-03-14T02:00:00Z' } }))
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: 'View certificate' }))
    expect(await screen.findByText('No certificate yet.')).toBeInTheDocument()
  })

  it('shows nothing about a certificate or the register before the booking is completed', async () => {
    const certificate = vi.spyOn(bookingsData, 'fetchCertificateHtml').mockResolvedValue('<html></html>')
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ status: 'approved' }))
    renderScreen()
    await screen.findByRole('button', { name: /mark completed/i })
    expect(screen.queryByRole('region', { name: 'Register entry' })).not.toBeInTheDocument()
    // The sidebar has a "Certificate requests" link; the screen itself must still say nothing about a certificate.
    expect(screen.queryByText(/certificate(?! requests)/i)).not.toBeInTheDocument()
    expect(certificate).not.toHaveBeenCalled()
  })

  it('renders no action buttons for a declined booking, and shows the reason', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ status: 'declined', statusReason: 'Not eligible' }))
    renderScreen()
    expect(await screen.findByText(/Reason for declining: Not eligible/)).toBeInTheDocument()
    const decision = screen.getByRole('region', { name: 'Decision' })
    expect(within(decision).queryAllByRole('button')).toHaveLength(0)
    expect(within(decision).getByText(/No decision left: this booking is declined/)).toBeInTheDocument()
  })

  it('lists documents in their own card, not in the details, and previews them with auth in a drawer', async () => {
    vi.spyOn(client, 'apiFetchBlob').mockResolvedValue(new Blob(['x'], { type: 'application/pdf' }))
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(
      makeBooking({ formData: { childFirstName: 'Baby', birthCertificate: '/documents/u1/birth.pdf' }, documents: [bookingDocument({ key: 'birthCertificate', label: 'Birth certificate', url: '/documents/u1/birth.pdf' })] }),
    )
    renderScreen()
    const docs = within(await screen.findByRole('region', { name: 'Documents' }))
    await userEvent.click(docs.getByRole('button', { name: 'Review Birth certificate' }))
    expect(await screen.findByRole('dialog', { name: 'Birth certificate' })).toBeInTheDocument()
    expect(await screen.findByTitle('Birth certificate')).toHaveAttribute('data', 'blob:mock-file-url')
  })

  it('blocks Approve while the GCash payment is unconfirmed, but still allows Decline', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ paymentStatus: 'unpaid', amountDueCentavos: 5000, paymentHoldExpiresAt: new Date(Date.now() + 3600_000 * 5).toISOString() }))
    renderScreen()
    expect(await screen.findByRole('button', { name: 'Approve booking' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Decline' })).toBeEnabled()
    expect(screen.getByRole('region', { name: 'Decision' })).toHaveTextContent('Take the payment')
  })

  it('opens Take payment from the checklist link', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ paymentStatus: 'unpaid', amountDueCentavos: 5000, paymentHoldExpiresAt: new Date(Date.now() + 3600_000 * 5).toISOString() }))
    renderScreen()
    await screen.findByRole('region', { name: 'Decision' })
    await userEvent.click(within(screen.getByRole('region', { name: 'Decision' })).getByRole('button', { name: 'Take payment' }))
    expect(await screen.findByRole('dialog', { name: /Take payment for/ })).toBeInTheDocument()
  })

  it('shows PayMongo-confirmed payment details and enables Approve once paid', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(
      makeBooking({ paymentStatus: 'paid', amountDueCentavos: 5000, amountPaidCentavos: 5000, paidAt: '2026-11-02T01:00:00Z', paymentReference: 'pay_123' }),
    )
    renderScreen()
    expect(await screen.findByText('pay_123')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve booking' })).not.toHaveAttribute('aria-disabled')
  })

  it('marks a walk-in, names who entered it and prints no missing email', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(
      makeBooking({ channel: 'walk_in', userId: null, user: { fullName: 'Walk In', email: null, phone: null }, createdBy: { id: 's1', fullName: 'Staff One' } }),
    )
    renderScreen()
    expect(await screen.findByText('Entered at the parish desk by Staff One.')).toBeInTheDocument()
    expect(screen.getAllByText('Walk-in').length).toBeGreaterThan(0)
    expect(screen.queryByText(/null|undefined/)).not.toBeInTheDocument()
  })

  it('shows the internal notes and the history on two tabs with their counts', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking())
    vi.spyOn(bookingsData, 'fetchBookingNotes').mockResolvedValue([{ id: 1, body: 'Priest is free that morning.', author: { id: 's1', fullName: 'Maria Santos' }, createdAt: '2026-11-02T02:00:00Z' }])
    vi.spyOn(bookingsData, 'fetchBookingHistory').mockResolvedValue([])
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: /^Notes and history/ }))
    expect(await screen.findByText('Priest is free that morning.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Notes 1' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: /History/ }))
    expect(await screen.findByText('Nothing has happened to this booking yet.')).toBeInTheDocument()
  })

  it('links a returned walk-in to the walk-in edit screen in this app', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(
      makeBooking({ id: '1', channel: 'walk_in', userId: null, status: 'returned', returnNote: 'Fix the date', createdBy: { id: 's1', fullName: 'Staff One' } }),
    )
    renderScreen()
    expect(await screen.findByRole('link', { name: 'Edit walk-in booking' })).toHaveAttribute('href', '/walk-in/1')
  })

  it('offers no walk-in edit link for an online booking', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ status: 'returned', returnNote: 'x' }))
    renderScreen()
    await screen.findByText(/Sent back for changes/)
    expect(screen.queryByRole('link', { name: 'Edit walk-in booking' })).not.toBeInTheDocument()
  })

  it('invalidates admin-schedule, admin-analytics, and admin-report-* queries after a booking action', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ status: 'approved', isEmergency: true }))
    const { client: qc } = renderScreen()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    fireEvent.click(await screen.findByRole('button', { name: 'Mark completed' }))
    const done = makeBooking({ status: 'completed', registerEntry: { id: 'r1', registerNumber: 'BAP-2026-0007', status: 'valid', enteredAt: '2026-03-14T02:00:00Z' } })
    vi.spyOn(bookingsData, 'completeBooking').mockResolvedValue(done)
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(done)
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Mark this booking completed?' })).getByRole('button', { name: 'Mark completed' }))

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['admin-schedule'] }))
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['admin-analytics'] }))
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['admin-register'] }))
      const predicateCalls = invalidate.mock.calls.filter((call) => call[0] && typeof call[0] === 'object' && 'predicate' in call[0])
      expect(predicateCalls.length).toBeGreaterThan(0)
    })
    // Completing the booking makes its register entry appear on the same screen.
    expect(await screen.findByRole('region', { name: 'Register entry' })).toBeInTheDocument()
  })

  it('shows the progress rail with the five stages', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ paymentStatus: 'paid', amountDueCentavos: 5000 }))
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: /^Progress/ }))
    const rail = await screen.findByRole('list', { name: 'Booking progress' })
    expect(within(rail).getAllByRole('listitem').map((li) => li.getAttribute('data-stage'))).toEqual(['requested', 'review', 'paid', 'confirmed', 'completed'])
  })

  it('shows a walk-in wedding with the late-document upload control and the "confirmed with a note" text', async () => {
    vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(
      makeBooking({
        sacrament: 'wedding', status: 'approved', channel: 'walk_in', userId: null, appointmentDate: '2099-01-08', appointmentStart: '10:00', appointmentEnd: '11:00',
        createdBy: { id: 's1', fullName: 'Staff One' },
        documents: [bookingDocument({ key: 'marriageLicense', label: 'Marriage license', required: false, url: null })],
        milestones: [milestone({ key: 'canonical_interview', label: 'Canonical interview', gating: true, done: false, state: 'upcoming' })],
      }),
    )
    const { container } = renderScreen()
    expect(await screen.findByLabelText('Add file for Marriage license')).toBeInTheDocument()
    expect(screen.getByText('Walk-in wedding: add the paper copy here, or confirm each step with a note when it is shown at the office.')).toBeInTheDocument()
    // The existing rule stays: completion is blocked while a required step is open, and the page says which.
    expect(screen.getByText(/Before this wedding can be marked completed: Canonical interview/)).toBeInTheDocument()
    await expectNoA11yViolations(container, { fullPage: true })
  })

  describe('the states around it', () => {
    it('shows a loading skeleton in the final layout', () => {
      vi.spyOn(bookingsData, 'fetchBooking').mockReturnValue(new Promise(() => {}))
      renderScreen()
      const busy = screen.getByRole('status', { name: 'Loading the booking' })
      expect(busy).toHaveAttribute('aria-busy', 'true')
      expect(busy.children.length).toBeGreaterThan(1)
    })

    it('shows an error with a retry that loads the booking again', async () => {
      const fetch = vi.spyOn(bookingsData, 'fetchBooking').mockRejectedValueOnce(new Error('Network down')).mockResolvedValue(makeBooking())
      renderScreen()
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent("This booking didn't load")
      expect(alert).toHaveTextContent('Network down')
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByRole('button', { name: /^Progress/ })).toBeInTheDocument()
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('says the booking was not found on a 404, with a way back to the queue', async () => {
      vi.unstubAllGlobals() // the router builds URLs; the file-link stub replaces that class
      vi.spyOn(bookingsData, 'fetchBooking').mockRejectedValue(new client.ApiError('Not found.', 404, { message: 'Not found.' }))
      renderScreen()
      expect(await screen.findByRole('heading', { name: 'Booking not found' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Bookings' }))
      expect(await screen.findByText('The queue')).toBeInTheDocument()
    })

    it('has no accessibility violations on a submitted booking', async () => {
      vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ paymentStatus: 'unpaid', amountDueCentavos: 5000, documents: [bookingDocument()] }))
      const { container } = renderScreen()
      await screen.findByRole('button', { name: /^Progress/ })
      await expectNoA11yViolations(container, { fullPage: true })
    })
  })

  describe('Previous and Next booking', () => {
    it('link to the bookings either side of this one in the queue the clerk came from', async () => {
      vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking())
      renderScreen((qc) => qc.setQueryData(['admin-bookings', 'x'], paginated([makeBooking({ id: '0' }), makeBooking({ id: '1' }), makeBooking({ id: '2' })])))
      expect(await screen.findByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/bookings/0')
      expect(screen.getByRole('link', { name: 'Next booking' })).toHaveAttribute('href', '/bookings/2')
    })

    it('are left out when there is no queue to be in', async () => {
      vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking())
      renderScreen()
      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument()
    })
  })

  describe('on a phone', () => {
    beforeEach(() => stubPhone(true))

    it('keeps the checklist in the Decision card and moves the buttons to a bar with More actions', async () => {
      vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ paymentStatus: 'unpaid', amountDueCentavos: 5000, documents: [bookingDocument()] }))
      renderScreen()
      const decision = await screen.findByRole('region', { name: 'Decision' })
      expect(within(decision).getByText('Take the payment')).toBeInTheDocument()
      expect(within(decision).queryByRole('button', { name: 'Approve booking' })).not.toBeInTheDocument()
      const approve = screen.getByRole('button', { name: 'Approve booking' })
      expect(approve).toHaveAttribute('aria-disabled', 'true')
      expect(document.getElementById(approve.getAttribute('aria-describedby') ?? '')).toHaveTextContent('2 things left before you can approve.')
      expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
    })

    it('folds notes, history and the filled-in form into rows that open in place', async () => {
      vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking())
      renderScreen()
      const notes = await screen.findByRole('button', { name: /Notes and history/ })
      expect(notes).toHaveAttribute('aria-expanded', 'false')
      await userEvent.click(notes)
      expect(notes).toHaveAttribute('aria-expanded', 'true')
      expect(await screen.findByRole('tab', { name: /Notes/ })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /Submitted details/ }))
      await userEvent.click(await screen.findByRole('button', { name: /^Child/ }))
      expect(await screen.findByText('Child first name')).toBeInTheDocument()
    })

    it('gives the call button the whole width', async () => {
      vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ user: { fullName: 'A B', email: null, phone: '09171234567' } }))
      renderScreen()
      expect(await screen.findByRole('link', { name: 'Call 0917 123 4567' })).toHaveClass('w-full')
    })

    it('has no accessibility violations', async () => {
      vi.spyOn(bookingsData, 'fetchBooking').mockResolvedValue(makeBooking({ documents: [bookingDocument()] }))
      const { container } = renderScreen()
      await screen.findByRole('button', { name: 'More actions' })
      await expectNoA11yViolations(container, { fullPage: true })
    })
  })
})
