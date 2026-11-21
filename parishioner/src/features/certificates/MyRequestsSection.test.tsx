import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MyRequestsSection } from '../wallet/MyRequestsSection'
import type { CertificateRequest } from '../../lib/types'

const list = vi.fn<() => Promise<CertificateRequest[]>>()
const cancel = vi.fn()
vi.mock('../../lib/data/certificateRequests', () => ({
  fetchMyCertificateRequests: () => list(),
  cancelCertificateRequest: (...a: unknown[]) => cancel(...a),
  createCertificateRequest: vi.fn(),
}))
const fetchHtml = vi.fn()
vi.mock('../../lib/data/registerEntries', () => ({
  fetchMyRegisterEntries: vi.fn().mockResolvedValue([]),
  fetchRegisterEntryCertificateHtml: (...a: unknown[]) => fetchHtml(...a),
}))

const req = (over: Partial<CertificateRequest> = {}): CertificateRequest => ({
  id: 'c1', referenceNumber: 'CERT-20261006-AB12', sacrament: 'baptism', personName: 'Ana Reyes', sacramentDateText: 'March 1998',
  details: { fatherName: null, motherName: null, spouseName: null }, relationship: 'self', purpose: 'Passport', status: 'submitted',
  declineReason: null, registerEntry: null, createdAt: '2026-10-06T03:00:00Z', closedAt: null, ...over,
})

function renderSection(state?: unknown) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[{ pathname: '/wallet', state }]}>
        <Routes>
          <Route path="/wallet" element={<MyRequestsSection />} />
          <Route path="/certificates/request" element={<p>request form</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MyRequestsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    list.mockResolvedValue([])
  })

  it('shows an empty state and the request button, which opens the form', async () => {
    const user = userEvent.setup()
    renderSection()
    expect(await screen.findByText(/no certificate requests/i)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /request a certificate copy/i }))
    expect(screen.getByText('request form')).toBeInTheDocument()
  })

  it('shows loading and an error with retry', async () => {
    list.mockRejectedValueOnce(new Error('x'))
    renderSection()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(await screen.findByText(/could not load your requests/i)).toBeInTheDocument()
    list.mockResolvedValue([req()])
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByText('CERT-20261006-AB12')).toBeInTheDocument()
  })

  it('shows the confirmation with the reference after a submit', async () => {
    renderSection({ submittedReference: 'CERT-20261006-AB12' })
    expect(await screen.findByRole('status')).toHaveTextContent('Your request was sent. Your reference is CERT-20261006-AB12.')
  })

  it('lists each request with reference, certificate, name, date and status chip', async () => {
    list.mockResolvedValue([
      req({ id: '1', referenceNumber: 'CERT-1', status: 'submitted' }),
      req({ id: '2', referenceNumber: 'CERT-2', sacrament: 'wedding', personName: 'Ben Cruz', status: 'issued', registerEntry: { id: 'e9', registerNumber: 'MAR-2026-0003' } }),
      req({ id: '3', referenceNumber: 'CERT-3', sacrament: 'funeral', status: 'declined', declineReason: 'No such record' }),
      req({ id: '4', referenceNumber: 'CERT-4', sacrament: 'confirmation', status: 'cancelled' }),
    ])
    renderSection()
    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(within(rows[0]).getByText('Submitted')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Baptismal certificate')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Ana Reyes')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Sent Oct 6, 2026')).toBeInTheDocument()
    expect(within(rows[0]).getByRole('button', { name: /cancel request/i })).toBeInTheDocument()
    expect(within(rows[1]).getByText('Issued')).toBeInTheDocument()
    expect(within(rows[1]).getByText('MAR-2026-0003')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Marriage certificate')).toBeInTheDocument()
    expect(within(rows[1]).getByRole('button', { name: /view certificate/i })).toBeInTheDocument()
    expect(within(rows[2]).getByText('Declined')).toBeInTheDocument()
    expect(within(rows[2]).getByText(/No such record/)).toBeInTheDocument()
    expect(within(rows[2]).getByText('Death certificate')).toBeInTheDocument()
    expect(within(rows[3]).getByText('Cancelled')).toBeInTheDocument()
    expect(within(rows[3]).queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens the issued entry certificate HTML', async () => {
    list.mockResolvedValue([req({ status: 'issued', registerEntry: { id: 'e9', registerNumber: 'BAP-2026-0001' } })])
    fetchHtml.mockResolvedValue('<html>cert</html>')
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    URL.createObjectURL = vi.fn(() => 'blob:x')
    renderSection()
    await userEvent.click(await screen.findByRole('button', { name: /view certificate/i }))
    await waitFor(() => expect(open).toHaveBeenCalled())
    expect(fetchHtml).toHaveBeenCalledWith('e9')
  })

  it('asks to confirm before cancelling, then calls the API and refreshes', async () => {
    list.mockResolvedValueOnce([req()]).mockResolvedValue([req({ status: 'cancelled' })])
    cancel.mockResolvedValue(req({ status: 'cancelled' }))
    const user = userEvent.setup()
    renderSection()
    await user.click(await screen.findByRole('button', { name: /cancel request/i }))
    expect(cancel).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /yes, cancel it/i }))
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('c1'))
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
  })

  it('can back out of the cancel confirmation', async () => {
    list.mockResolvedValue([req()])
    const user = userEvent.setup()
    renderSection()
    await user.click(await screen.findByRole('button', { name: /cancel request/i }))
    await user.click(screen.getByRole('button', { name: /keep it/i }))
    expect(cancel).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
