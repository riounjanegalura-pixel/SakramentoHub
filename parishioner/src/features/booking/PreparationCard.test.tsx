import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PreparationCard } from './PreparationCard'
import type { Booking, Milestone } from '../../lib/types'

const uploadDocument = vi.fn()
const attachLateDocument = vi.fn()
vi.mock('../../lib/data/documents', () => ({ uploadDocument: (...a: unknown[]) => uploadDocument(...a) }))
vi.mock('../../lib/data/bookings', () => ({ attachLateDocument: (...a: unknown[]) => attachLateDocument(...a) }))

const KEYS: [string, string, boolean, boolean][] = [
  ['submitted', 'Booking submitted', false, false],
  ['paid', 'Fee paid', false, false],
  ['core_documents', 'Core documents accepted', true, false],
  ['canonical_interview', 'Canonical interview', true, true],
  ['banns_requested', 'Banns requested', false, true],
  ['pre_cana', 'Pre-Cana seminar', true, true],
  ['banns_completed', 'Banns completed or dispensed', true, true],
  ['marriage_license', 'Marriage license or Art. 34 affidavit', true, true],
  ['confession', 'Confession', false, true],
  ['approved', 'Booking approved', false, false],
  ['wedding_day', 'Wedding day', false, false],
  ['civil_registry', 'Marriage certificate sent to the Local Civil Registrar', false, true],
]

function row(key: string, over: Partial<Milestone> = {}): Milestone {
  const k = KEYS.find((x) => x[0] === key)!
  return { key, label: k[1], done: false, state: 'upcoming', source: null, dueDate: null, gating: k[2], manual: k[3], doneAt: null, data: null, ...over }
}

function rows(overrides: Record<string, Partial<Milestone>> = {}, mixed = false): Milestone[] {
  const list = KEYS.map(([key]) => row(key, overrides[key]))
  if (mixed) list.splice(4, 0, { ...row('banns_requested'), key: 'mixed_marriage_permission', label: 'Permission for a mixed marriage', gating: true })
  return list
}

const base: Booking = {
  id: 'w1', referenceNumber: 'WEDD-20261102-AB12', userId: 'u1', sacrament: 'wedding', status: 'approved',
  statusLabel: 'Approved', formData: {}, appointmentDate: '2026-12-12', appointmentStart: '10:00', appointmentEnd: '11:00',
  isEmergency: false, paymentStatus: 'paid', amountDueCentavos: 0, paymentHoldExpiresAt: null, paidAt: null, paymentReference: null,
  refundReference: null, refundedAt: null, statusReason: null, returnNote: null, createdAt: '2026-11-02T00:00:00Z',
  milestones: rows(),
}

function wedding(over: Partial<Booking> = {}): Booking {
  return { ...base, ...over }
}

const onUpdated = vi.fn()
function Card({ b }: { b: Booking }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <PreparationCard booking={b} onUpdated={onUpdated} />
    </QueryClientProvider>
  )
}
function renderCard(b: Booking) {
  return render(<Card b={b} />)
}

describe('PreparationCard', () => {
  beforeEach(() => {
    uploadDocument.mockReset()
    attachLateDocument.mockReset()
    onUpdated.mockReset()
  })

  it('counts the rows up to approved: 12 rows give 10', () => {
    renderCard(wedding({ milestones: rows({ submitted: { done: true, state: 'done' }, paid: { done: true, state: 'done' } }) }))
    expect(screen.getByRole('heading', { name: 'Wedding preparation' })).toBeInTheDocument()
    expect(screen.getByText('2 of 10 done')).toBeInTheDocument()
  })

  it('counts 11 when a mixed-marriage row is present', () => {
    renderCard(wedding({ milestones: rows({}, true) }))
    expect(screen.getByText('0 of 11 done')).toBeInTheDocument()
  })

  it('does not count the wedding day or the civil registry', () => {
    renderCard(wedding({ status: 'completed', milestones: rows({ wedding_day: { done: true, state: 'done' }, civil_registry: { done: true, state: 'done' } }) }))
    expect(screen.getByText('0 of 10 done')).toBeInTheDocument()
  })

  it('marks overdue and due rows in words, with the due date', () => {
    renderCard(wedding({
      milestones: rows({
        canonical_interview: { state: 'overdue', dueDate: '2026-11-03' },
        pre_cana: { state: 'due', dueDate: '2026-11-20' },
        confession: { state: 'upcoming', dueDate: '2026-12-09' },
      }),
    }))
    const interview = screen.getByText('Canonical interview').closest('li')!
    expect(within(interview).getByText('Overdue')).toBeInTheDocument()
    expect(within(interview).getByText('Due Nov 3, 2026')).toBeInTheDocument()
    const preCana = screen.getByText('Pre-Cana seminar').closest('li')!
    expect(within(preCana).getByText('Due soon')).toBeInTheDocument()
    expect(within(preCana).getByText('Due Nov 20, 2026')).toBeInTheDocument()
  })

  it('does not show a due date on a finished row', () => {
    renderCard(wedding({ milestones: rows({ canonical_interview: { done: true, state: 'done', dueDate: '2026-11-03', source: 'staff' } }) }))
    const li = screen.getByText('Canonical interview').closest('li')!
    expect(within(li).getByText('Done')).toBeInTheDocument()
    expect(within(li).queryByText(/due nov/i)).not.toBeInTheDocument()
  })

  it('tags gating rows and the recommended confession', () => {
    renderCard(wedding())
    const interview = screen.getByText('Canonical interview').closest('li')!
    expect(within(interview).getByText('Required before the wedding')).toBeInTheDocument()
    const confession = screen.getByText('Confession').closest('li')!
    expect(within(confession).getByText('Recommended')).toBeInTheDocument()
    expect(within(confession).queryByText('Required before the wedding')).not.toBeInTheDocument()
  })

  it('highlights the first open required step with what to do', () => {
    renderCard(wedding({ milestones: rows({ submitted: { done: true, state: 'done' }, core_documents: { done: true, state: 'done' } }) }))
    const next = screen.getByText('Canonical interview').closest('li')!
    expect(within(next).getByText('Next step')).toBeInTheDocument()
    expect(within(next).getByText('Call the parish office to set your interview with the priest.')).toBeInTheDocument()
    expect(screen.getAllByText('Next step')).toHaveLength(1)
  })

  it('moves the highlight on and explains the license', () => {
    renderCard(wedding({
      milestones: rows({
        core_documents: { done: true, state: 'done' }, canonical_interview: { done: true, state: 'done' },
        pre_cana: { done: true, state: 'done' }, banns_completed: { done: true, state: 'done' },
      }),
    }))
    const next = screen.getByText('Marriage license or Art. 34 affidavit').closest('li')!
    expect(within(next).getByText('Next step')).toBeInTheDocument()
    expect(within(next).getByText(/valid for 120 days from the day it was issued/)).toBeInTheDocument()
    expect(within(next).getByText(/confirmed by the parish office/i)).toBeInTheDocument()
  })

  it('never shows a staff note, even if one is sent', () => {
    renderCard(wedding({ milestones: rows({ canonical_interview: { note: 'Booked with Fr. Jose for Nov 5' } as never }) }))
    expect(screen.queryByText('Booked with Fr. Jose for Nov 5')).not.toBeInTheDocument()
  })

  it('shows the license details, or the Art. 34 affidavit', () => {
    const { unmount } = renderCard(
      wedding({ milestones: rows({ marriage_license: { done: true, state: 'done', source: 'staff', data: { licenseNumber: 'ML-2026-118', issuedOn: '2026-10-22', issuedAt: 'Tarlac City' } } }) }),
    )
    expect(screen.getByText('License no. ML-2026-118, issued Oct 22, 2026 at Tarlac City')).toBeInTheDocument()
    unmount()
    renderCard(wedding({ milestones: rows({ marriage_license: { done: true, state: 'done', source: 'staff', data: { art34: true } } }) }))
    expect(screen.getByText('Art. 34 affidavit')).toBeInTheDocument()
  })

  it('hides the civil registry row until the wedding is completed', () => {
    const { unmount } = renderCard(wedding())
    expect(screen.queryByText(/Local Civil Registrar/)).not.toBeInTheDocument()
    unmount()
    renderCard(wedding({ status: 'completed' }))
    expect(screen.getByText(/Local Civil Registrar/)).toBeInTheDocument()
  })

  it.each(['draft', 'returned', 'cancelled', 'declined'] as const)('renders nothing on a %s wedding', (status) => {
    renderCard(wedding({ status }))
    expect(screen.queryByText('Wedding preparation')).not.toBeInTheDocument()
  })

  it('renders nothing for a booking with no milestones', () => {
    renderCard(wedding({ sacrament: 'baptism', milestones: [] }))
    expect(screen.queryByText('Wedding preparation')).not.toBeInTheDocument()
  })

  it('shows the review state of a document-backed row', () => {
    renderCard(wedding({
      documents: [
        { key: 'preCanaCertificate', label: 'Pre-Cana seminar certificate', required: false, url: '/documents/u1/a.pdf', review: { status: 'rejected', note: 'Blurry', reviewedAt: null } },
        { key: 'bannsCertificate', label: 'banns certificate', required: false, url: '/documents/u1/b.pdf', review: null },
      ],
    }))
    const preCana = screen.getByText('Pre-Cana seminar').closest('li')!
    expect(within(preCana).getByText('Needs a new file')).toBeInTheDocument()
    expect(within(preCana).getByText('Staff note: Blurry')).toBeInTheDocument()
    expect(within(preCana).getByText('Upload a new file')).toBeInTheDocument()
    const banns = screen.getByText('Banns completed or dispensed').closest('li')!
    expect(within(banns).getByText('Waiting for review')).toBeInTheDocument()
    const confession = screen.getByText('Confession').closest('li')!
    expect(within(confession).getByText('Not uploaded')).toBeInTheDocument()
    expect(within(confession).getByText('Upload')).toBeInTheDocument()
  })

  it('uploads, attaches under the right key and hands back the refreshed booking', async () => {
    const updated = wedding({ statusLabel: 'Approved' })
    uploadDocument.mockResolvedValue({ url: '/documents/u1/new.pdf' })
    attachLateDocument.mockResolvedValue(updated)
    renderCard(wedding())
    const file = new File(['x'], 'cert.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText(/upload a file for pre-cana seminar/i), file)

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated))
    expect(uploadDocument).toHaveBeenCalledWith(file)
    expect(attachLateDocument).toHaveBeenCalledWith('w1', 'preCanaCertificate', '/documents/u1/new.pdf')
  })

  it.each([
    ['Banns completed or dispensed', 'bannsCertificate'],
    ['Confession', 'confessionCertificate'],
    ['Marriage license or Art. 34 affidavit', 'marriageLicense'],
  ])('maps %s to %s', async (label, docKey) => {
    uploadDocument.mockResolvedValue({ url: '/u.pdf' })
    attachLateDocument.mockResolvedValue(wedding())
    renderCard(wedding())
    await userEvent.upload(screen.getByLabelText(`Upload a file for ${label}`), new File(['x'], 'c.pdf'))
    await waitFor(() => expect(attachLateDocument).toHaveBeenCalledWith('w1', docKey, '/u.pdf'))
  })

  it('shows the server message when the upload is refused', async () => {
    uploadDocument.mockResolvedValue({ url: '/u.pdf' })
    attachLateDocument.mockRejectedValue(new Error('Documents can be added only while the booking is submitted or approved.'))
    renderCard(wedding())
    await userEvent.upload(screen.getByLabelText(/upload a file for confession/i), new File(['x'], 'c.pdf'))
    expect(await screen.findByText('Documents can be added only while the booking is submitted or approved.')).toBeInTheDocument()
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('has no upload buttons once the wedding is completed', () => {
    renderCard(wedding({ status: 'completed' }))
    expect(screen.queryByText(/upload/i)).not.toBeInTheDocument()
  })

  it('does not tell a completed wedding what to do next', () => {
    renderCard(wedding({ status: 'completed' }))
    expect(screen.queryByText('Next step')).not.toBeInTheDocument()
  })
})
