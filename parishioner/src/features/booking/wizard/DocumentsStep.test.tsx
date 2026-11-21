import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WizardContext } from './WizardContext'
import { useBookingStore } from '../../../stores/booking-store'
import { wizardFor } from './registry'
import type { Booking } from '../../../lib/types'

const fetchBooking = vi.fn()
vi.mock('../../../lib/data/bookings', () => ({ fetchBooking: (...a: unknown[]) => fetchBooking(...a) }))
const uploadDocument = vi.fn()
vi.mock('../../../lib/data/documents', () => ({ uploadDocument: (...a: unknown[]) => uploadDocument(...a) }))

const definition = wizardFor('funeral')!
const documentsStep = definition.steps.find((s) => s.id === 'documents')!
const next = vi.fn()

function serverBooking(review: NonNullable<Booking['documents']>[number]['review']): Booking {
  return {
    id: 'b1', referenceNumber: 'FUNE-1', userId: 'u1', sacrament: 'funeral', status: 'returned', statusLabel: 'Needs changes', formData: {},
    appointmentDate: null, appointmentStart: null, appointmentEnd: null, isEmergency: false, paymentStatus: 'not_required',
    amountDueCentavos: 0, paymentHoldExpiresAt: null, paidAt: null, paymentReference: null, refundReference: null, refundedAt: null,
    statusReason: null, returnNote: 'x', createdAt: '2026-11-02T00:00:00Z',
    documents: [{ key: 'deathCertificate', label: 'death certificate', required: true, url: '/documents/u1/old.pdf', review }],
  }
}

function renderStep() {
  const Step = documentsStep.Component
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <WizardContext.Provider value={{ definition, stepIndex: 4, total: 6, next, goTo: vi.fn(), cancel: vi.fn(), stepId: 'documents' }}>
        <Step step={documentsStep} />
      </WizardContext.Provider>
    </QueryClientProvider>,
  )
}

describe('Documents step review states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBookingStore.getState().startBooking('funeral')
    useBookingStore.getState().updateFormData({ deathCertificate: '/documents/u1/old.pdf' })
    useBookingStore.getState().setEditingBookingId('b1')
  })

  it('shows the staff note and blocks Continue until a new file is uploaded', async () => {
    const user = userEvent.setup()
    fetchBooking.mockResolvedValue(serverBooking({ status: 'rejected', note: 'Blurry — please re-upload', reviewedAt: '2026-11-02T01:00:00Z' }))
    renderStep()

    expect(await screen.findByText(/needs a new file/i)).toBeInTheDocument()
    expect(screen.getByText(/blurry — please re-upload/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByText(/upload a new file/i, { selector: 'p' })).toBeInTheDocument()
    expect(next).not.toHaveBeenCalled()
  })

  it('accepts a replacement file and lets the parishioner continue', async () => {
    const user = userEvent.setup()
    fetchBooking.mockResolvedValue(serverBooking({ status: 'rejected', note: 'Blurry', reviewedAt: '2026-11-02T01:00:00Z' }))
    uploadDocument.mockResolvedValue({ url: '/documents/u1/new.pdf' })
    renderStep()
    await screen.findByText(/needs a new file/i)

    await user.upload(screen.getByLabelText(/death certificate/i), new File(['x'], 'new.pdf', { type: 'application/pdf' }))
    expect(await screen.findByText(/new file ready/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(next).toHaveBeenCalled())
    expect(useBookingStore.getState().formData.deathCertificate).toBe('/documents/u1/new.pdf')
  })

  it('shows an accepted document with a tick and lets the parishioner continue', async () => {
    const user = userEvent.setup()
    fetchBooking.mockResolvedValue(serverBooking({ status: 'accepted', note: null, reviewedAt: '2026-11-02T01:00:00Z' }))
    renderStep()
    expect(await screen.findByText('Accepted')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(next).toHaveBeenCalled())
  })

  it('shows no review state for a fresh draft', async () => {
    useBookingStore.getState().setEditingBookingId(null)
    renderStep()
    await screen.findByRole('heading', { name: /requirements/i })
    expect(screen.queryByText(/accepted|needs a new file|waiting for review/i)).not.toBeInTheDocument()
    expect(fetchBooking).not.toHaveBeenCalled()
  })
})
