import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DecisionCard, PhoneActionBar, useDecision } from './BookingActions'
import type { AdminBooking } from '../../lib/types'
import { ApiError } from '../../lib/api/client'
import { parishToday } from '../../lib/domain'
import { adminBooking, bookingDocument } from '../../test/factories'

const api = vi.hoisted(() => ({
  approveBooking: vi.fn(), declineBooking: vi.fn(), returnBooking: vi.fn(),
  cancelBooking: vi.fn(), completeBooking: vi.fn(), checkInBooking: vi.fn(), markRefunded: vi.fn(), rescheduleBooking: vi.fn(),
}))
vi.mock('../../lib/data/bookings', () => api)
const schedule = vi.hoisted(() => ({ fetchAvailability: vi.fn() }))
vi.mock('../../lib/data/schedule', () => schedule)

const booking = (o: Partial<AdminBooking> = {}): AdminBooking =>
  adminBooking({
    id: 'b1', referenceNumber: 'FUNE-1', sacrament: 'funeral', isPriority: true,
    user: { fullName: 'Ana Reyes', email: 'a@x.com', phone: null },
    appointmentDate: '2030-01-08', appointmentStart: '10:00', appointmentEnd: '11:00',
    paymentStatus: 'not_required', amountDueCentavos: 0, createdAt: '2026-11-02T00:00:00Z', ...o,
  })

function Harness({ b, onChanged, phone = false }: { b: AdminBooking; onChanged: (b: AdminBooking) => void; phone?: boolean }) {
  const d = useDecision(b, onChanged)
  return (
    <>
      <DecisionCard booking={b} decision={d} onTakePayment={vi.fn()} phone={phone} />
      {phone && <PhoneActionBar decision={d} />}
      {d.dialogs}
    </>
  )
}

function renderDecision(b: AdminBooking, onChanged = vi.fn(), phone = false) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness b={b} onChanged={onChanged} phone={phone} />
    </QueryClientProvider>,
  )
  return onChanged
}

function stubPhone(on: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

const dialog = (name: RegExp | string) => screen.getByRole('dialog', { name })

describe('the Decision card', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset().mockResolvedValue(booking({ status: 'approved' }))))
  afterEach(() => vi.unstubAllGlobals())

  it('groups the decisions in one region named Decision, with the checklist beside the buttons', () => {
    renderDecision(booking())
    const region = screen.getByRole('region', { name: 'Decision' })
    expect(within(region).getByRole('heading', { name: 'Ready to approve' })).toBeInTheDocument()
    expect(within(region).getByRole('list', { name: 'What approving needs' })).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Approve booking' })).not.toHaveAttribute('aria-disabled')
    expect(within(region).getByRole('button', { name: 'Send back to parishioner' })).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Decline' })).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Reschedule' })).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument()
  })

  it('approves a cleared booking and hands the result to the parent', async () => {
    const onChanged = renderDecision(booking())
    await userEvent.click(screen.getByRole('button', { name: 'Approve booking' }))
    expect(api.approveBooking).toHaveBeenCalledWith('b1')
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('draws exactly one filled button: Approve when approving is open, Send back when a document is rejected', () => {
    renderDecision(booking())
    const region = screen.getByRole('region', { name: 'Decision' })
    expect(region.querySelectorAll('[data-variant="default"]')).toHaveLength(1)
  })

  it('blocks Approve with a visible checklist, never a silently disabled button', async () => {
    renderDecision(booking({ sacrament: 'wedding', paymentStatus: 'unpaid', amountDueCentavos: 500000 }))
    const approve = screen.getByRole('button', { name: 'Approve booking' })
    expect(approve).toHaveAttribute('aria-disabled', 'true')
    expect(approve).not.toBeDisabled()
    expect(screen.getByRole('heading', { name: 'To approve' })).toBeInTheDocument()
    expect(screen.getByText('Take the payment')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Still to do' })).toBeInTheDocument()
    expect(document.getElementById(approve.getAttribute('aria-describedby') ?? '')).toHaveTextContent('1 thing left before you can approve.')
    await userEvent.click(approve)
    expect(api.approveBooking).not.toHaveBeenCalled()
  })

  it('says to record cash first while cash at the parish office is pending', () => {
    renderDecision(booking({ sacrament: 'wedding', paymentStatus: 'pending_cash', paymentMethod: 'cash', amountDueCentavos: 500000 }))
    expect(screen.getByText('Take the cash payment')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve booking' })).toHaveAttribute('aria-disabled', 'true')
  })

  it.each([
    ['refund_due', 'Payment needs a refund before this can be approved.'],
    ['refunded', 'This booking cannot be approved after a refund.'],
    ['void', 'This booking cannot be approved with a voided payment.'],
  ] as const)('blocks approval for a %s payment and says why', (paymentStatus, why) => {
    renderDecision(booking({ paymentStatus, amountDueCentavos: 500000, amountPaidCentavos: 500000 }))
    expect(screen.getByText(why)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve booking' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('allows approval for a legacy booking with no payment record', () => {
    renderDecision(booking({ paymentStatus: null }))
    expect(screen.getByText('No payment needed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve booking' })).not.toHaveAttribute('aria-disabled')
  })

  it('blocks Approve until every uploaded document is accepted, counting them in words', () => {
    renderDecision(booking({ documents: [bookingDocument({ key: 'a', label: 'A' }), bookingDocument({ key: 'b', label: 'B', review: { status: 'accepted', note: null, reviewedBy: 'S', reviewedAt: '2026-11-02T00:00:00Z' } })] }))
    expect(screen.getByText('Review every uploaded document')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 accepted')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review documents' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve booking' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('ignores a required document that is not uploaded yet', () => {
    renderDecision(booking({ documents: [bookingDocument({ key: 'a', url: null })] }))
    expect(screen.getByRole('button', { name: 'Approve booking' })).not.toHaveAttribute('aria-disabled')
  })

  it('counts several things left in the plural', () => {
    renderDecision(booking({ paymentStatus: 'unpaid', amountDueCentavos: 5000, documents: [bookingDocument()] }))
    expect(document.body).toHaveTextContent('2 things left before you can approve.')
  })

  it('shows the server refusal under the buttons', async () => {
    api.approveBooking.mockRejectedValue(new ApiError('This booking was already approved.', 409, null))
    renderDecision(booking())
    await userEvent.click(screen.getByRole('button', { name: 'Approve booking' }))
    expect(await screen.findByText('This booking was already approved.')).toBeInTheDocument()
  })

  describe('Send back', () => {
    it('needs words, says so as an instruction, then sends them', async () => {
      renderDecision(booking())
      await userEvent.click(screen.getByRole('button', { name: 'Send back to parishioner' }))
      const d = dialog(/^Send back to/)
      expect(within(d).getByRole('heading', { name: 'Send back to Ana?' })).toBeInTheDocument()
      await userEvent.click(within(d).getByRole('button', { name: 'Send back' }))
      expect(within(d).getByText('Write what needs to change. The parishioner reads it.')).toBeInTheDocument()
      expect(api.returnBooking).not.toHaveBeenCalled()
      await userEvent.type(within(d).getByLabelText(/what needs to change/i), 'Upload a clearer death certificate')
      await userEvent.click(within(d).getByRole('button', { name: 'Send back' }))
      expect(api.returnBooking).toHaveBeenCalledWith('b1', 'Upload a clearer death certificate')
    })

    it('lets the note stay empty when a document was rejected, and names the documents', async () => {
      const rejected = bookingDocument({ label: 'Death certificate', review: { status: 'rejected', note: 'Blurry', reviewedBy: 'S', reviewedAt: '2026-11-02T00:00:00Z' } })
      renderDecision(booking({ documents: [rejected] }))
      // A rejected document makes Send back the one filled button.
      const region = screen.getByRole('region', { name: 'Decision' })
      expect(region.querySelector('[data-variant="default"]')).toHaveTextContent('Send back to parishioner')
      await userEvent.click(within(region).getByRole('button', { name: 'Send back to parishioner' }))
      const d = dialog(/^Send back to/)
      expect(within(d).getByText('Death certificate')).toBeInTheDocument()
      await userEvent.click(within(d).getByRole('button', { name: 'Send back' }))
      expect(api.returnBooking).toHaveBeenCalledWith('b1', undefined)
    })

    it('caps the note at the server limit', async () => {
      renderDecision(booking())
      await userEvent.click(screen.getByRole('button', { name: 'Send back to parishioner' }))
      expect(within(dialog(/^Send back to/)).getByLabelText(/what needs to change/i)).toHaveAttribute('maxlength', '1000')
    })
  })

  describe('Decline', () => {
    it('needs a reason, offers the usual ones, warns that a paid booking becomes a refund, and sends it', async () => {
      renderDecision(booking({ sacrament: 'wedding', paymentStatus: 'paid', amountDueCentavos: 300000, amountPaidCentavos: 300000 }))
      await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
      const d = dialog('Decline this booking?')
      expect(within(d).getByRole('heading', { name: 'Decline this booking?' })).toBeInTheDocument()
      expect(within(d).getByRole('note')).toHaveTextContent('Declining makes a refund due.')
      await userEvent.click(within(d).getByRole('button', { name: 'Decline booking' }))
      expect(within(d).getByText('Write the reason. The parishioner reads it.')).toBeInTheDocument()
      expect(api.declineBooking).not.toHaveBeenCalled()
      await userEvent.click(within(d).getByRole('button', { name: 'Parish schedule conflict' }))
      expect(within(d).getByLabelText(/^reason/i)).toHaveValue('Parish schedule conflict')
      await userEvent.click(within(d).getByRole('button', { name: 'Decline booking' }))
      expect(api.declineBooking).toHaveBeenCalledWith('b1', 'Parish schedule conflict')
    })

    it('does not warn about a refund when nothing was paid', async () => {
      renderDecision(booking())
      await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
      expect(within(dialog('Decline this booking?')).queryByRole('note')).not.toBeInTheDocument()
    })

    it('offers another date instead, with the reason pre-filled, and never declines', async () => {
      schedule.fetchAvailability.mockResolvedValue({ status: 'available', freeStarts: ['09:00'] })
      renderDecision(booking())
      await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
      await userEvent.click(within(dialog('Decline this booking?')).getByRole('button', { name: 'Offer another date instead' }))
      const r = await screen.findByRole('dialog', { name: 'Move to another time' })
      expect(within(r).getByLabelText(/^reason/i)).toHaveValue('Parish schedule conflict')
      expect(api.declineBooking).not.toHaveBeenCalled()
    })

    it('does not offer another date for an urgent request or a returned booking', async () => {
      renderDecision(booking({ isEmergency: true }))
      await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
      expect(within(dialog('Decline this booking?')).queryByRole('button', { name: 'Offer another date instead' })).not.toBeInTheDocument()
    })

    it('shows the server refusal inside the dialog', async () => {
      api.declineBooking.mockRejectedValue(new ApiError('Only an open booking can be declined.', 422, null))
      renderDecision(booking())
      await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
      const d = dialog('Decline this booking?')
      await userEvent.type(within(d).getByLabelText(/^reason/i), 'No')
      await userEvent.click(within(d).getByRole('button', { name: 'Decline booking' }))
      expect(await within(d).findByText('Only an open booking can be declined.')).toBeInTheDocument()
    })

    it('closes on Escape without declining', async () => {
      renderDecision(booking())
      await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(api.declineBooking).not.toHaveBeenCalled()
    })
  })

  describe('Cancel booking', () => {
    it('sends the cancel reason', async () => {
      renderDecision(booking())
      await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }))
      const d = dialog('Cancel this booking?')
      await userEvent.type(within(d).getByLabelText(/^reason/i), 'Family request')
      await userEvent.click(within(d).getByRole('button', { name: 'Cancel booking' }))
      expect(api.cancelBooking).toHaveBeenCalledWith('b1', 'Family request')
    })

    it('is not offered on a completed booking', () => {
      renderDecision(booking({ status: 'completed' }))
      expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument()
      expect(screen.getByText(/No decision left: this booking is completed/)).toBeInTheDocument()
    })
  })

  describe('Reschedule', () => {
    it('is offered for submitted and approved bookings, not for urgent, returned or closed ones', () => {
      renderDecision(booking({ status: 'approved' }))
      expect(screen.getByRole('button', { name: 'Reschedule' })).toBeInTheDocument()
    })

    it.each([
      ['an urgent request', { isEmergency: true }],
      ['a returned booking', { status: 'returned' as const }],
      ['a completed booking', { status: 'completed' as const }],
    ])('is not offered for %s', (_name, o) => {
      renderDecision(booking(o))
      expect(screen.queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument()
    })

    it('moves the booking to a free time with a reason', async () => {
      schedule.fetchAvailability.mockResolvedValue({ status: 'available', freeStarts: ['09:00', '10:00', '14:00'] })
      renderDecision(booking())
      await userEvent.click(screen.getByRole('button', { name: 'Reschedule' }))
      const d = dialog('Move to another time')
      await userEvent.click(within(d).getByRole('button', { name: 'Move booking' }))
      expect(within(d).getByText('Choose a new date.')).toBeInTheDocument()
      expect(within(d).getByText('Write the reason. The parishioner reads it.')).toBeInTheDocument()
      await userEvent.type(within(d).getByLabelText(/^New date/), '2030-02-05')
      const time = await within(d).findByRole('button', { name: '10:00 AM' })
      expect(time).toHaveAttribute('aria-pressed', 'false')
      await userEvent.click(time)
      expect(time).toHaveAttribute('aria-pressed', 'true')
      await userEvent.type(within(d).getByLabelText(/^reason/i), 'Church closed for repairs')
      await userEvent.click(within(d).getByRole('button', { name: 'Move booking' }))
      expect(api.rescheduleBooking).toHaveBeenCalledWith('b1', { appointmentDate: '2030-02-05', appointmentStart: '10:00', reason: 'Church closed for repairs', waiveLeadTime: false })
    })

    it('says when the date has no free times', async () => {
      schedule.fetchAvailability.mockResolvedValue({ status: 'available', freeStarts: [] })
      renderDecision(booking())
      await userEvent.click(screen.getByRole('button', { name: 'Reschedule' }))
      await userEvent.type(within(dialog('Move to another time')).getByLabelText(/^New date/), '2030-02-05')
      expect(await screen.findByText('No free times on this date. Choose another date.')).toBeInTheDocument()
    })

    it('shows the schedule\'s own reason when the date is unavailable', async () => {
      schedule.fetchAvailability.mockResolvedValue({ status: 'unavailable', reason: 'The church is closed on Good Friday.', freeStarts: [] })
      renderDecision(booking())
      await userEvent.click(screen.getByRole('button', { name: 'Reschedule' }))
      await userEvent.type(within(dialog('Move to another time')).getByLabelText(/^New date/), '2030-02-05')
      expect(await screen.findByText('The church is closed on Good Friday.')).toBeInTheDocument()
    })
  })

  describe('after approval', () => {
    it('keeps Mark completed drawn but blocked before the appointment day, and says when it opens', async () => {
      renderDecision(booking({ status: 'approved', appointmentDate: '2030-01-08' }))
      const done = screen.getByRole('button', { name: 'Mark completed' })
      expect(done).toHaveAttribute('aria-disabled', 'true')
      expect(document.getElementById(done.getAttribute('aria-describedby') ?? '')).toHaveTextContent('Opens on January 8, the day of the appointment.')
      await userEvent.click(done)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Check in' })).not.toBeInTheDocument()
    })

    it('makes Check in the filled button on the appointment day, then asks before completing', async () => {
      renderDecision(booking({ status: 'approved', appointmentDate: parishToday() }))
      const region = screen.getByRole('region', { name: 'Decision' })
      expect(region.querySelector('[data-variant="default"]')).toHaveTextContent('Check in')
      await userEvent.click(within(region).getByRole('button', { name: 'Mark completed' }))
      const d = dialog('Mark this booking completed?')
      expect(d).toHaveTextContent('This cannot be undone.')
      await userEvent.click(within(d).getByRole('button', { name: 'Not yet' }))
      expect(api.completeBooking).not.toHaveBeenCalled()
      await userEvent.click(within(region).getByRole('button', { name: 'Mark completed' }))
      await userEvent.click(within(dialog('Mark this booking completed?')).getByRole('button', { name: 'Mark completed' }))
      expect(api.completeBooking).toHaveBeenCalledWith('b1')
    })

    it('checks the party in', async () => {
      renderDecision(booking({ status: 'approved', appointmentDate: parishToday() }))
      await userEvent.click(screen.getByRole('button', { name: 'Check in' }))
      expect(api.checkInBooking).toHaveBeenCalledWith('b1')
    })

    it('shows the server refusal: Check-in opens on the appointment day', async () => {
      api.checkInBooking.mockRejectedValue(new ApiError('Check-in opens on the appointment day (November 6, 2026).', 422, null))
      renderDecision(booking({ status: 'approved', appointmentDate: parishToday() }))
      await userEvent.click(screen.getByRole('button', { name: 'Check in' }))
      expect(await screen.findByText('Check-in opens on the appointment day (November 6, 2026).')).toBeInTheDocument()
    })

    it('makes Mark completed the filled button once the party has arrived', () => {
      renderDecision(booking({ status: 'approved', appointmentDate: parishToday(), checkedInAt: '2026-11-06T06:05:00Z' }))
      expect(screen.queryByRole('button', { name: 'Check in' })).not.toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Decision' }).querySelector('[data-variant="default"]')).toHaveTextContent('Mark completed')
    })

    it('enables Mark completed for an approved urgent booking with no date', async () => {
      renderDecision(booking({ status: 'approved', isEmergency: true, appointmentDate: null, appointmentStart: null, appointmentEnd: null }))
      expect(screen.getByRole('button', { name: 'Mark completed' })).not.toHaveAttribute('aria-disabled')
    })

    it('shows the open-steps refusal when completing a wedding', async () => {
      api.completeBooking.mockRejectedValue(new ApiError('Finish the open steps first.', 422, null))
      renderDecision(booking({ status: 'approved', isEmergency: true, appointmentDate: null, appointmentStart: null, appointmentEnd: null }))
      await userEvent.click(screen.getByRole('button', { name: 'Mark completed' }))
      await userEvent.click(within(dialog('Mark this booking completed?')).getByRole('button', { name: 'Mark completed' }))
      expect(await within(dialog('Mark this booking completed?')).findByText('Finish the open steps first.')).toBeInTheDocument()
    })
  })

  describe('other states', () => {
    it('offers decline and cancel, but not approve, for a returned booking, and says what it waits for', () => {
      renderDecision(booking({ status: 'returned' }))
      expect(screen.getByRole('heading', { name: 'Waiting for changes' })).toBeInTheDocument()
      expect(screen.getByText('Waiting for Ana to send the changes.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Approve booking' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument()
    })

    it('says a walk-in is waiting at the office desk', () => {
      renderDecision(booking({ status: 'returned', channel: 'walk_in' }))
      expect(screen.getByText('Waiting for the changes to be made at the office desk.')).toBeInTheDocument()
    })

    it('offers only cancel for a draft', () => {
      renderDecision(booking({ status: 'draft' }))
      expect(screen.getByText('This booking has not been sent yet.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument()
    })

    it('has no filled button when every decision left is a refusal (returned)', () => {
      renderDecision(booking({ status: 'returned' }))
      expect(screen.getByRole('region', { name: 'Decision' }).querySelectorAll('[data-variant="default"]')).toHaveLength(0)
    })
  })

  describe('refunds', () => {
    it('makes the refund the filled button on a closed booking with a refund due, and records it with its reference', async () => {
      renderDecision(booking({ status: 'declined', paymentStatus: 'refund_due', amountDueCentavos: 50000, amountPaidCentavos: 50000, paymentMethod: 'gcash' }))
      expect(screen.getByRole('region', { name: 'Decision' }).querySelector('[data-variant="default"]')).toHaveTextContent('Record the refund')
      expect(screen.getByText(/Refund it in the PayMongo dashboard/)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Record the refund' }))
      const d = dialog(/^Record the .* refund$/)
      expect(within(d).getByRole('heading', { name: 'Record the ₱500.00 refund' })).toBeInTheDocument()
      await userEvent.click(within(d).getByRole('button', { name: 'Mark refunded' }))
      expect(within(d).getByText('Write the refund reference. It goes in the history.')).toBeInTheDocument()
      await userEvent.type(within(d).getByLabelText(/^PayMongo refund reference/), 'rf_123')
      await userEvent.click(within(d).getByRole('button', { name: 'Mark refunded' }))
      expect(api.markRefunded).toHaveBeenCalledWith('b1', 'rf_123', undefined)
    })

    it('a cash-paid refund is returned at the parish office: no PayMongo wording, a plain "Refund reference"', async () => {
      renderDecision(booking({ status: 'cancelled', paymentStatus: 'refund_due', amountDueCentavos: 50000, amountPaidCentavos: 50000, paymentMethod: 'cash' }))
      expect(screen.getByText(/made in cash at the parish office/i)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Record the refund' }))
      const d = dialog(/^Record the .* refund$/)
      expect(within(d).getByLabelText(/^Refund reference/)).toBeInTheDocument()
      expect(d).not.toHaveTextContent('PayMongo')
    })
  })

  describe('on a phone', () => {
    beforeEach(() => stubPhone(true))

    it('moves the buttons to a bar: one primary and a More actions button that lists the rest', async () => {
      renderDecision(booking(), vi.fn(), true)
      const region = screen.getByRole('region', { name: 'Decision' })
      expect(within(region).queryByRole('button', { name: 'Approve booking' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Approve booking' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
      const menu = screen.getByRole('dialog', { name: 'More actions' })
      for (const name of ['Send back to parishioner', 'Decline', 'Reschedule', 'Cancel booking']) {
        expect(within(menu).getByRole('button', { name })).toBeInTheDocument()
      }
    })

    it('opens Decline as a bottom sheet from More actions, with the same reason, chips and buttons', async () => {
      renderDecision(booking({ paymentStatus: 'paid', amountDueCentavos: 300000, amountPaidCentavos: 300000 }), vi.fn(), true)
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
      await userEvent.click(within(screen.getByRole('dialog', { name: 'More actions' })).getByRole('button', { name: 'Decline' }))
      const sheet = await screen.findByRole('dialog', { name: 'Decline this booking?' })
      expect(within(sheet).getByRole('heading', { name: 'Decline this booking?' })).toBeInTheDocument()
      expect(within(sheet).getByRole('note')).toHaveTextContent('Paid ₱3,000.00. Declining makes a refund due.')
      await userEvent.click(within(sheet).getByRole('button', { name: 'Not eligible for this sacrament' }))
      await userEvent.click(within(sheet).getByRole('button', { name: 'Decline booking' }))
      expect(api.declineBooking).toHaveBeenCalledWith('b1', 'Not eligible for this sacrament')
    })

    it('keeps the blocked Approve in the bar, with its reason beside it', () => {
      renderDecision(booking({ paymentStatus: 'unpaid', amountDueCentavos: 5000 }), vi.fn(), true)
      const approve = screen.getByRole('button', { name: 'Approve booking' })
      expect(approve).toHaveAttribute('aria-disabled', 'true')
      expect(document.getElementById(approve.getAttribute('aria-describedby') ?? '')).toHaveTextContent('1 thing left before you can approve.')
    })
  })
})
