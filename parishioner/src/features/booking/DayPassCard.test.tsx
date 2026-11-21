import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DayPassCard } from './DayPassCard'
import type { Booking } from '../../lib/types'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="1" height="1"/></svg>'
const base: Booking = {
  id: 'w1', referenceNumber: 'WEDD-20261102-AB12', userId: 'u1', sacrament: 'wedding', status: 'approved',
  statusLabel: 'Approved', formData: { groomFirstName: 'Juan', groomLastName: 'Cruz', brideFirstName: 'Maria', brideLastName: 'Santos' },
  appointmentDate: '2026-12-12', appointmentStart: '10:00', appointmentEnd: '11:00', isEmergency: false,
  paymentStatus: 'paid', amountDueCentavos: 0, paymentHoldExpiresAt: null, paidAt: null, paymentReference: null,
  refundReference: null, refundedAt: null, statusReason: null, returnNote: null, createdAt: '2026-11-02T00:00:00Z',
  dayPass: { url: 'https://admin.example/check-in/WEDD-20261102-AB12', qrSvg: SVG }, checkedInAt: null,
}

describe('DayPassCard', () => {
  it('shows the pass with its QR, reference, who, when and where', () => {
    render(<DayPassCard booking={base} parishName="St. Peter Parish" />)
    expect(screen.getByRole('heading', { name: 'Day pass' })).toBeInTheDocument()
    const qr = screen.getByRole('img', { name: 'QR code for staff to scan' })
    expect(qr.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('WEDD-20261102-AB12')).toBeInTheDocument()
    expect(screen.getByText('Juan Cruz & Maria Santos')).toBeInTheDocument()
    expect(screen.getByText(/sat, dec 12, 2026 · 10:00 am/i)).toBeInTheDocument()
    expect(screen.getByText('St. Peter Parish')).toBeInTheDocument()
    expect(screen.getByText('Show this at the parish office on the day.')).toBeInTheDocument()
  })

  it('prints through the browser', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<DayPassCard booking={base} />)
    await userEvent.click(screen.getByRole('button', { name: 'Print' }))
    expect(print).toHaveBeenCalled()
  })

  it('renders nothing without a QR (list responses carry only the url)', () => {
    const { container } = render(<DayPassCard booking={{ ...base, dayPass: { url: 'https://x/y' } }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there is no day pass', () => {
    const { container } = render(<DayPassCard booking={{ ...base, dayPass: null }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the check-in time once the office checked the party in', () => {
    render(<DayPassCard booking={{ ...base, checkedInAt: '2026-12-12T01:42:00Z' }} />)
    expect(screen.getByText('Checked in at 9:42 AM')).toBeInTheDocument()
  })

  it('shows no check-in line before that', () => {
    render(<DayPassCard booking={base} />)
    expect(screen.queryByText(/checked in/i)).not.toBeInTheDocument()
  })
})
