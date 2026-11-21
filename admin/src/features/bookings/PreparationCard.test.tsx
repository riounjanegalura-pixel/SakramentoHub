import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreparationCard } from './PreparationCard'
import * as bookingsData from '../../lib/data/bookings'
import { ApiError } from '../../lib/api/client'
import { renderWithProviders } from '../../test/render'
import { adminBooking, milestone } from '../../test/factories'
import type { AdminBooking, Milestone } from '../../lib/types'

const CIVIL = 'Marriage certificate sent to the Local Civil Registrar'
const LICENSE = 'Marriage license or Art. 34 affidavit'

const rows = (): Milestone[] => [
  milestone({ key: 'submitted', label: 'Booking submitted', gating: false, manual: false, done: true, state: 'done', source: 'auto', dueDate: null }),
  milestone({ key: 'paid', label: 'Fee paid', gating: false, manual: false, done: true, state: 'done', source: 'auto', dueDate: null }),
  milestone({ key: 'core_documents', label: 'Core documents accepted', manual: false, done: true, state: 'done', source: 'document', dueDate: null }),
  milestone({ key: 'canonical_interview', label: 'Canonical interview', dueDate: '2026-12-01', state: 'overdue' }),
  milestone({
    key: 'banns_requested', label: 'Banns requested', gating: false, dueDate: '2026-12-16', done: true, state: 'done', source: 'staff',
    note: 'Posted at the church door', doneAt: '2026-10-05T02:00:00Z', doneBy: { id: 's1', fullName: 'Maria Santos' },
  }),
  milestone({ key: 'pre_cana', label: 'Pre-Cana seminar', dueDate: '2026-12-31', state: 'due' }),
  milestone({ key: 'banns_completed', label: 'Banns completed or dispensed', dueDate: '2027-01-16', state: 'upcoming' }),
  milestone({ key: 'marriage_license', label: LICENSE, dueDate: '2027-01-16', state: 'upcoming' }),
  milestone({ key: 'confession', label: 'Confession', gating: false, dueDate: '2027-01-27', state: 'upcoming' }),
  milestone({ key: 'approved', label: 'Booking approved', gating: false, manual: false, dueDate: null }),
  milestone({ key: 'wedding_day', label: 'Wedding day', gating: false, manual: false, dueDate: null }),
  milestone({ key: 'civil_registry', label: CIVIL, gating: false, dueDate: '2027-02-14', state: 'upcoming' }),
]

const wedding = (o: Partial<AdminBooking> = {}, ms: Milestone[] = rows()) =>
  adminBooking({ id: 'w1', sacrament: 'wedding', status: 'submitted', appointmentDate: '2027-01-30', milestones: ms, ...o })

const row = (label: string) => within(screen.getByRole('listitem', { name: label }))

function renderCard(b: AdminBooking, onChanged = vi.fn()) {
  renderWithProviders(<PreparationCard booking={b} onChanged={onChanged} />)
  return onChanged
}

describe('PreparationCard', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('renders nothing for other sacraments, drafts and a wedding with no rows', () => {
    const a = renderWithProviders(<PreparationCard booking={adminBooking({ sacrament: 'baptism' })} onChanged={vi.fn()} />)
    expect(a.container).toBeEmptyDOMElement()
    const b = renderWithProviders(<PreparationCard booking={wedding({ status: 'returned' })} onChanged={vi.fn()} />)
    expect(b.container).toBeEmptyDOMElement()
    const c = renderWithProviders(<PreparationCard booking={wedding({}, [])} onChanged={vi.fn()} />)
    expect(c.container).toBeEmptyDOMElement()
  })

  it('shows each row with a state in words, the due date and a Required tag on gating rows', () => {
    renderCard(wedding())
    expect(screen.getByRole('heading', { name: 'Wedding preparation' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(12)
    expect(row('Canonical interview').getByText('Overdue')).toBeInTheDocument()
    expect(row('Canonical interview').getByText(/Due Dec 1, 2026/)).toBeInTheDocument()
    expect(row('Canonical interview').getByText('Required')).toBeInTheDocument()
    expect(row('Pre-Cana seminar').getByText('Due now')).toBeInTheDocument()
    expect(row('Banns completed or dispensed').getByText('Upcoming')).toBeInTheDocument()
    expect(row('Banns requested').queryByText('Required')).not.toBeInTheDocument()
    expect(row('Booking submitted').getByText('Done')).toBeInTheDocument()
  })

  it('says how a step was done', () => {
    renderCard(wedding())
    expect(row('Core documents accepted').getByText('Document accepted')).toBeInTheDocument()
    expect(row('Banns requested').getByText(/Ticked by Maria Santos, Oct 5/)).toBeInTheDocument()
    expect(row('Banns requested').getByText(/Posted at the church door/)).toBeInTheDocument()
  })

  it('describes a license by its details or as an Art. 34 affidavit', () => {
    const lic = (data: Milestone['data'], note: string | null) =>
      rows().map((r) => r.key === 'marriage_license'
        ? { ...r, done: true, state: 'done' as const, source: 'staff' as const, data, note, doneAt: '2026-10-05T02:00:00Z', doneBy: { id: 's1', fullName: 'Maria Santos' } }
        : r)
    const first = renderWithProviders(<PreparationCard booking={wedding({}, lic({ licenseNumber: 'ML-123', issuedOn: '2026-10-22', issuedAt: 'Quezon City' }, null))} onChanged={vi.fn()} />)
    expect(screen.getByText(/ML-123/)).toBeInTheDocument()
    expect(screen.getByText(/Quezon City/)).toBeInTheDocument()
    first.unmount()
    renderWithProviders(<PreparationCard booking={wedding({}, lic({ art34: true }, 'Cohabiting five years'))} onChanged={vi.fn()} />)
    expect(screen.getByText(/^Art\. 34 affidavit · Ticked by/)).toBeInTheDocument()
    expect(screen.getByText(/Cohabiting five years/)).toBeInTheDocument()
  })

  it('ticks a step with an optional note, then hands the booking up', async () => {
    const updated = wedding({ statusLabel: 'updated' })
    const spy = vi.spyOn(bookingsData, 'tickMilestone').mockResolvedValue(updated)
    const onChanged = renderCard(wedding())
    await userEvent.click(row('Pre-Cana seminar').getByRole('button', { name: 'Mark done' }))
    await userEvent.type(screen.getByLabelText(/note/i), 'Attended 3 Oct')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('w1', 'pre_cana', { done: true, note: 'Attended 3 Oct' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated))
  })

  it('ticks without a note for an ordinary step', async () => {
    const spy = vi.spyOn(bookingsData, 'tickMilestone').mockResolvedValue(wedding())
    renderCard(wedding())
    await userEvent.click(row('Canonical interview').getByRole('button', { name: 'Mark done' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('w1', 'canonical_interview', { done: true }))
  })

  it('undoes a staff tick', async () => {
    const spy = vi.spyOn(bookingsData, 'tickMilestone').mockResolvedValue(wedding())
    renderCard(wedding())
    await userEvent.click(row('Banns requested').getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('w1', 'banns_requested', { done: false }))
  })

  it('offers no buttons on computed rows or on a step a document completed', () => {
    renderCard(wedding())
    expect(row('Booking submitted').queryByRole('button')).not.toBeInTheDocument()
    expect(row('Core documents accepted').queryByRole('button')).not.toBeInTheDocument()
    expect(row('Wedding day').queryByRole('button')).not.toBeInTheDocument()
  })

  it('requires a note for the mixed-marriage permission', async () => {
    const ms = rows()
    ms.splice(5, 0, milestone({ key: 'mixed_marriage_permission', label: 'Permission for a mixed marriage', dueDate: '2026-12-31' }))
    const spy = vi.spyOn(bookingsData, 'tickMilestone').mockResolvedValue(wedding())
    renderCard(wedding({}, ms))
    expect(screen.getAllByRole('listitem')).toHaveLength(13)
    await userEvent.click(row('Permission for a mixed marriage').getByRole('button', { name: 'Mark done' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/note/i), 'Dispensation from the bishop')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('w1', 'mixed_marriage_permission', { done: true, note: 'Dispensation from the bishop' }))
  })

  it('shows a rule refusal as a message', async () => {
    vi.spyOn(bookingsData, 'tickMilestone').mockRejectedValue(new ApiError('Preparation steps can only be updated while the booking is submitted or approved.', 422, { message: 'x' }))
    renderCard(wedding())
    await userEvent.click(row('Pre-Cana seminar').getByRole('button', { name: 'Mark done' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/can only be updated while the booking is submitted or approved/)).toBeInTheDocument()
  })

  describe('marriage license', () => {
    const open = async () => {
      renderCard(wedding())
      await userEvent.click(row(LICENSE).getByRole('button', { name: 'Mark done' }))
    }
    const fillDetails = async () => {
      await userEvent.type(screen.getByLabelText('License number'), 'ML-123')
      await userEvent.type(screen.getByLabelText('Date of issue'), '2026-10-22')
      await userEvent.type(screen.getByLabelText('Place of issue'), 'Quezon City')
    }

    it('sends the number, date and place of issue', async () => {
      const spy = vi.spyOn(bookingsData, 'tickMilestone').mockResolvedValue(wedding())
      await open()
      await fillDetails()
      await userEvent.click(screen.getByRole('button', { name: 'Save license' }))
      await waitFor(() => expect(spy).toHaveBeenCalledWith('w1', 'marriage_license', { done: true, licenseNumber: 'ML-123', issuedOn: '2026-10-22', issuedAt: 'Quezon City' }))
    })

    it('needs all three details', async () => {
      await open()
      await userEvent.type(screen.getByLabelText('License number'), 'ML-123')
      expect(screen.getByRole('button', { name: 'Save license' })).toBeDisabled()
    })

    it('switches to Art. 34 with a required note', async () => {
      const spy = vi.spyOn(bookingsData, 'tickMilestone').mockResolvedValue(wedding())
      await open()
      await userEvent.click(screen.getByLabelText('Art. 34 affidavit (no license needed)'))
      expect(screen.queryByLabelText('License number')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save license' })).toBeDisabled()
      await userEvent.type(screen.getByLabelText(/note/i), 'Cohabiting five years')
      await userEvent.click(screen.getByRole('button', { name: 'Save license' }))
      await waitFor(() => expect(spy).toHaveBeenCalledWith('w1', 'marriage_license', { done: true, art34: true, note: 'Cohabiting five years' }))
    })

    it('shows the 120-day sentence under the date of issue and other errors under their fields', async () => {
      const sentence = 'A marriage license is valid for 120 days: issued October 22, 2026, it covers weddings until February 19, 2027.'
      vi.spyOn(bookingsData, 'tickMilestone').mockRejectedValue(
        new ApiError(sentence, 422, { message: sentence, errors: { issuedOn: [sentence], licenseNumber: ['The license number is too long.'] } }),
      )
      await open()
      await fillDetails()
      await userEvent.click(screen.getByRole('button', { name: 'Save license' }))
      await waitFor(() => expect(screen.getByLabelText('Date of issue')).toHaveAccessibleDescription(sentence))
      expect(screen.getByLabelText('License number')).toHaveAccessibleDescription('The license number is too long.')
    })

    it('shows a rule refusal as a message', async () => {
      vi.spyOn(bookingsData, 'tickMilestone').mockRejectedValue(new ApiError('This wedding is completed. Only the civil registry step can still be updated.', 422, { message: 'x' }))
      await open()
      await fillDetails()
      await userEvent.click(screen.getByRole('button', { name: 'Save license' }))
      expect(await screen.findByText(/Only the civil registry step can still be updated/)).toBeInTheDocument()
    })
  })

  describe('by status', () => {
    it('lists the open required steps on an approved wedding only', () => {
      const approved = renderWithProviders(<PreparationCard booking={wedding({ status: 'approved' })} onChanged={vi.fn()} />)
      const banner = screen.getByRole('status')
      expect(banner).toHaveTextContent('Before this wedding can be marked completed:')
      expect(banner).toHaveTextContent('Canonical interview')
      expect(banner).toHaveTextContent(LICENSE)
      expect(banner).not.toHaveTextContent('Banns requested')
      expect(banner).not.toHaveTextContent('Core documents accepted')
      approved.unmount()
      renderWithProviders(<PreparationCard booking={wedding({ status: 'submitted' })} onChanged={vi.fn()} />)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('shows no banner on an approved wedding with nothing open', () => {
      const ms = rows().map((r) => (r.gating ? { ...r, done: true, state: 'done' as const } : r))
      renderCard(wedding({ status: 'approved' }, ms))
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('offers no civil registry step before the wedding is completed', () => {
      renderCard(wedding({ status: 'approved' }))
      expect(row(CIVIL).queryByRole('button')).not.toBeInTheDocument()
    })

    it('on a completed wedding only the civil registry step can be ticked', () => {
      renderCard(wedding({ status: 'completed' }))
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(row('Banns requested').queryByRole('button')).not.toBeInTheDocument()
      expect(row('Canonical interview').queryByRole('button')).not.toBeInTheDocument()
      expect(row(CIVIL).getByRole('button', { name: 'Mark done' })).toBeInTheDocument()
    })

    it('lets staff undo the civil registry step once ticked', () => {
      const ms = rows().map((r) => (r.key === 'civil_registry'
        ? { ...r, done: true, state: 'done' as const, source: 'staff' as const, doneAt: '2027-02-10T02:00:00Z', doneBy: { id: 's1', fullName: 'Maria Santos' } }
        : r))
      renderCard(wedding({ status: 'completed' }, ms))
      expect(row(CIVIL).getByRole('button', { name: 'Undo' })).toBeInTheDocument()
      expect(row('Banns requested').queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    })
  })
})
