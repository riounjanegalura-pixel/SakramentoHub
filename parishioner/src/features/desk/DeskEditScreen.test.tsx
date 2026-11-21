import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DeskEditScreen } from './DeskEditScreen'
import { useBookingStore } from '../../stores/booking-store'
import { useDeskStore } from '../../stores/desk-store'
import type { DeskBooking } from '../../lib/types'

const fetchDeskBooking = vi.fn()
vi.mock('../../lib/data/walkIns', () => ({ fetchDeskBooking: (...a: unknown[]) => fetchDeskBooking(...a) }))

const returned = (over: Partial<DeskBooking> = {}): DeskBooking => ({
  id: 'w9', referenceNumber: 'FUNE-20261102-ZZ99', userId: null, sacrament: 'funeral', status: 'returned', statusLabel: 'Needs changes',
  formData: { bookingFor: 'other', relationship: 'child', deceasedFirstName: 'Lorenzo' }, appointmentDate: '2026-11-10', appointmentStart: '10:00',
  appointmentEnd: '11:00', isEmergency: false, paymentStatus: 'not_required', amountDueCentavos: 0, paymentHoldExpiresAt: null, paidAt: null,
  paymentReference: null, refundReference: null, refundedAt: null, statusReason: null, returnNote: 'Re-upload the death certificate', createdAt: '2026-11-02T00:00:00Z',
  channel: 'walk_in',
  user: { fullName: 'Aling Rosa Dela Cruz', email: 'rosa@example.com', phone: '09171234567' },
  walkInContact: { fullName: 'Aling Rosa Dela Cruz', email: 'rosa@example.com', phone: '09171234567', relationship: 'child' },
  createdBy: null,
  ...over,
})

function renderEdit() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/desk/booking/w9']}>
        <Routes>
          <Route path="/desk/booking/:id" element={<DeskEditScreen />} />
          <Route path="/desk/:sacrament/:step" element={<p>Wizard page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DeskEditScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBookingStore.getState().reset()
    useDeskStore.getState().reset()
  })

  it('loads a returned walk-in into the wizard at its first step', async () => {
    fetchDeskBooking.mockResolvedValue(returned())
    renderEdit()
    expect(await screen.findByText('Wizard page')).toBeInTheDocument()

    expect(useBookingStore.getState()).toMatchObject({ sacrament: 'funeral', editingBookingId: 'w9', appointmentDate: '2026-11-10', appointmentStart: '10:00' })
    expect(useBookingStore.getState().formData.deceasedFirstName).toBe('Lorenzo')
    expect(useDeskStore.getState()).toMatchObject({
      draftId: 'w9',
      contact: { fullName: 'Aling Rosa Dela Cruz', phone: '09171234567', email: 'rosa@example.com' },
      linkedAccount: null,
    })
  })

  it('takes the contact from walkInContact, never from the linked account, and keeps the link', async () => {
    fetchDeskBooking.mockResolvedValue(
      returned({
        userId: 'acct-1',
        user: { fullName: 'Rosa D. Cruz (account)', email: 'Rosa@Example.com', phone: '09990000000' },
        walkInContact: { fullName: 'Aling Rosa Dela Cruz', email: 'Rosa@Example.com', phone: '09171234567', relationship: 'child' },
      }),
    )
    renderEdit()
    await screen.findByText('Wizard page')
    expect(useDeskStore.getState().contact).toEqual({ fullName: 'Aling Rosa Dela Cruz', phone: '09171234567', email: 'Rosa@Example.com' })
    // The link compares against the confirmed email, lower-cased like the contact step does.
    expect(useDeskStore.getState().linkedAccount).toEqual({ id: 'acct-1', fullName: 'Rosa D. Cruz (account)', email: 'rosa@example.com' })
  })

  it.each([
    ['an online booking', { channel: 'online' as const, walkInContact: null }],
    ['a walk-in that is not returned', { status: 'approved' as const }],
  ])('refuses %s', async (_label, over) => {
    fetchDeskBooking.mockResolvedValue(returned(over))
    renderEdit()
    expect(await screen.findByText(/only a returned walk-in booking can be edited here/i)).toBeInTheDocument()
    expect(screen.queryByText('Wizard page')).not.toBeInTheDocument()
  })
})
