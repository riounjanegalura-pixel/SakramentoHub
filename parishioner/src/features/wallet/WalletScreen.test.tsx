import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { WalletScreen } from './WalletScreen'
import type { CertificateRequest, RegisterEntrySummary, WalletDocument } from '../../lib/types'
import { expectNoA11yViolations } from '../../test/a11y'
import { expectTokenOnlySource } from '../../test/tokenSource'
import { setViewport } from '../../test/viewport'

const fetchWallet = vi.fn<() => Promise<WalletDocument[]>>()
const addFile = vi.fn()
const del = vi.fn()
vi.mock('../../lib/data/wallet', () => ({
  fetchWallet: () => fetchWallet(),
  addWalletDocumentFile: (...a: unknown[]) => addFile(...a),
  addWalletDocumentByUrl: vi.fn(),
  deleteWalletDocument: (...a: unknown[]) => del(...a),
}))
const fetchEntries = vi.fn<() => Promise<RegisterEntrySummary[]>>()
const fetchCertHtml = vi.fn()
vi.mock('../../lib/data/registerEntries', () => ({
  fetchMyRegisterEntries: () => fetchEntries(),
  fetchRegisterEntryCertificateHtml: (...a: unknown[]) => fetchCertHtml(...a),
}))
const fetchRequests = vi.fn<() => Promise<CertificateRequest[]>>()
vi.mock('../../lib/data/certificateRequests', () => ({
  fetchMyCertificateRequests: () => fetchRequests(),
  cancelCertificateRequest: vi.fn(),
}))
const fetchDocumentFile = vi.fn()
vi.mock('../../lib/data/documents', () => ({ fetchDocumentFile: (...a: unknown[]) => fetchDocumentFile(...a), uploadDocument: vi.fn() }))

const doc = (over: Partial<WalletDocument> = {}): WalletDocument => ({
  id: 'w1', kind: 'birth_certificate', personName: 'Ana Reyes', fileUrl: '/documents/u1/a.pdf', originalName: 'a.pdf',
  mime: 'application/pdf', sizeBytes: 10, createdAt: '2026-10-05T03:00:00Z', ...over,
})
const entry = (over: Partial<RegisterEntrySummary> = {}): RegisterEntrySummary => ({
  id: 'e1', registerNumber: 'BAP-2026-0007', register: 'Baptism', subjectName: 'Ana Reyes', ceremonyDate: '2026-09-12',
  status: 'valid', verifyUrl: null, via: 'booking', ...over,
})

function renderScreen() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <WalletScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WalletScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    localStorage.clear()
    fetchWallet.mockResolvedValue([])
    fetchEntries.mockResolvedValue([])
    fetchRequests.mockResolvedValue([])
    setViewport(390)
  })

  beforeAll(() => {
    Element.prototype.setPointerCapture ??= () => {}
    Element.prototype.releasePointerCapture ??= () => {}
    Element.prototype.hasPointerCapture ??= () => false
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  describe('My documents', () => {
    it('accepts only JPG, PNG or PDF, and no longer offers a Government ID kind', async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(await screen.findByRole('button', { name: /add a document/i }))
      const select = screen.getByLabelText(/kind of document/i)
      expect(within(select).queryByRole('option', { name: 'Government ID' })).not.toBeInTheDocument()
      const accept = screen.getByLabelText(/^file/i).getAttribute('accept') ?? ''
      expect(accept.split(',').map((t) => t.trim()).sort()).toEqual(['.jpeg', '.jpg', '.pdf', '.png'])
    })

    it('shows an empty state and the count', async () => {
      renderScreen()
      expect(await screen.findByText('No documents saved yet.')).toBeInTheDocument()
      expect(screen.getByText(/what the wallet is for|reuse it the next time a booking asks/i)).toBeInTheDocument()
      expect(screen.getByText('0 of 30')).toBeInTheDocument()
    })

    it('lists a document with its kind, person and added date', async () => {
      fetchWallet.mockResolvedValue([doc()])
      renderScreen()
      expect(await screen.findByText('Birth certificate')).toBeInTheDocument()
      expect(screen.getByText('Ana Reyes')).toBeInTheDocument()
      expect(screen.getByText('Added Oct 5, 2026')).toBeInTheDocument()
      expect(screen.getByText('1 of 30')).toBeInTheDocument()
    })

    it('opens a document through the authenticated loader', async () => {
      const user = userEvent.setup()
      fetchWallet.mockResolvedValue([doc()])
      fetchDocumentFile.mockResolvedValue(new Blob(['x'], { type: 'application/pdf' }))
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      URL.createObjectURL = vi.fn(() => 'blob:abc')
      renderScreen()
      await user.click(await screen.findByRole('button', { name: /view birth certificate/i }))
      await waitFor(() => expect(open).toHaveBeenCalledWith('blob:abc', '_blank', 'noopener,noreferrer'))
      expect(fetchDocumentFile).toHaveBeenCalledWith('/documents/u1/a.pdf')
    })

    it('adds a document only when file, kind and name are given', async () => {
      const user = userEvent.setup()
      addFile.mockResolvedValue(doc())
      renderScreen()
      await user.click(await screen.findByRole('button', { name: /add a document/i }))
      await user.click(screen.getByRole('button', { name: /save to wallet/i }))
      expect(await screen.findByText(/choose a file/i)).toBeInTheDocument()
      expect(screen.getByText(/choose the kind of document/i)).toBeInTheDocument()
      expect(screen.getByText(/enter whose document this is/i)).toBeInTheDocument()
      expect(addFile).not.toHaveBeenCalled()

      const file = new File(['x'], 'birth.pdf', { type: 'application/pdf' })
      await user.upload(screen.getByLabelText(/^file/i), file)
      await user.selectOptions(screen.getByLabelText(/kind of document/i), 'birth_certificate')
      await user.type(screen.getByLabelText(/whose document is this/i), 'Ana Reyes')
      await user.click(screen.getByRole('button', { name: /save to wallet/i }))
      await waitFor(() => expect(addFile).toHaveBeenCalledWith(file, 'birth_certificate', 'Ana Reyes'))
    })

    it('shows the full-wallet message from the server', async () => {
      const user = userEvent.setup()
      addFile.mockRejectedValue(new Error('Your wallet is full (30 documents). Delete one to add another.'))
      renderScreen()
      await user.click(await screen.findByRole('button', { name: /add a document/i }))
      await user.upload(screen.getByLabelText(/^file/i), new File(['x'], 'b.pdf', { type: 'application/pdf' }))
      await user.selectOptions(screen.getByLabelText(/kind of document/i), 'other')
      await user.type(screen.getByLabelText(/whose document is this/i), 'Ana')
      await user.click(screen.getByRole('button', { name: /save to wallet/i }))
      expect(await screen.findByText('Your wallet is full (30 documents). Delete one to add another.')).toBeInTheDocument()
    })

    it('deletes after a confirm that says bookings keep the file', async () => {
      const user = userEvent.setup()
      fetchWallet.mockResolvedValue([doc()])
      del.mockResolvedValue(undefined)
      renderScreen()
      await user.click(await screen.findByRole('button', { name: /delete birth certificate/i }))
      expect(await screen.findByText(/stays attached to any booking already using it/i)).toBeInTheDocument()
      expect(del).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: /^delete$/i }))
      await waitFor(() => expect(del).toHaveBeenCalledWith('w1'))
    })
  })

  describe('consent line', () => {
    it('shows until dismissed and stays dismissed', async () => {
      const user = userEvent.setup()
      const first = renderScreen()
      expect(await screen.findByText(/only you can open/i)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /got it/i }))
      expect(screen.queryByText(/only you can open/i)).not.toBeInTheDocument()
      first.unmount()
      renderScreen()
      await screen.findByText('No documents saved yet.')
      expect(screen.queryByText(/only you can open/i)).not.toBeInTheDocument()
    })

    it('still works when storage throws', async () => {
      const user = userEvent.setup()
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
      renderScreen()
      expect(await screen.findByText(/only you can open/i)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /got it/i }))
      expect(screen.queryByText(/only you can open/i)).not.toBeInTheDocument()
    })
  })

  describe('My certificates', () => {
    it('explains when there are none', async () => {
      renderScreen()
      expect(await screen.findByText(/appear here after a sacrament is completed/i)).toBeInTheDocument()
    })

    it('lists an entry with View, and no verification link when there is none', async () => {
      const user = userEvent.setup()
      fetchEntries.mockResolvedValue([entry()])
      fetchCertHtml.mockResolvedValue('<html>cert</html>')
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      URL.createObjectURL = vi.fn(() => 'blob:cert')
      renderScreen()
      const card = (await screen.findByText('BAP-2026-0007')).closest('li') as HTMLElement
      expect(within(card).getByText('Baptism')).toBeInTheDocument()
      expect(within(card).getByText('Ana Reyes')).toBeInTheDocument()
      expect(within(card).getByText(/Sep 12, 2026/)).toBeInTheDocument()
      expect(within(card).queryByText(/withdrawn by the parish office/i)).not.toBeInTheDocument()
      expect(within(card).queryByRole('button', { name: /verification link/i })).not.toBeInTheDocument()
      await user.click(within(card).getByRole('button', { name: /^view/i }))
      await waitFor(() => expect(open).toHaveBeenCalledWith('blob:cert', '_blank', 'noopener,noreferrer'))
      expect(fetchCertHtml).toHaveBeenCalledWith('e1')
    })

    it('notes a withdrawn certificate', async () => {
      fetchEntries.mockResolvedValue([entry({ status: 'revoked' })])
      renderScreen()
      expect(await screen.findByText(/withdrawn by the parish office/i)).toBeInTheDocument()
    })

    it('copies the verification link, or shows it as text when copying is not possible', async () => {
      const user = userEvent.setup()
      fetchEntries.mockResolvedValue([entry({ verifyUrl: 'https://app.test/verify/BAP-2026-0007/ABCD-EFGH' })])
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
      renderScreen()
      await user.click(await screen.findByRole('button', { name: /verification link/i }))
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.test/verify/BAP-2026-0007/ABCD-EFGH'))
      expect(await screen.findByText(/link copied/i)).toBeInTheDocument()

      writeText.mockRejectedValue(new Error('denied'))
      await user.click(screen.getByRole('button', { name: /verification link/i }))
      expect(await screen.findByText('https://app.test/verify/BAP-2026-0007/ABCD-EFGH')).toBeInTheDocument()
    })
  })

  describe('My requests', () => {
    it('has an empty state for now', async () => {
      renderScreen()
      expect(await screen.findByText('You have no certificate requests.')).toBeInTheDocument()
    })
  })

  describe('four states, cards and structure', () => {
    it('uses tokens only in every wallet source file', () => {
      for (const f of ['WalletScreen.tsx', 'AddWalletDocumentSheet.tsx', 'MyRequestsSection.tsx', 'WalletTileExtras.tsx', 'WalletPicker.tsx']) {
        expectTokenOnlySource(import.meta.dirname, f)
      }
    })

    it('shows a skeleton in the final shape while loading, then the list', async () => {
      fetchWallet.mockReturnValue(new Promise(() => {}))
      const { container } = renderScreen()
      expect(container.querySelectorAll('[data-testid="documents-skeleton"] [data-slot="skeleton"]').length).toBeGreaterThanOrEqual(2)
      expect(screen.queryByText('No documents saved yet.')).not.toBeInTheDocument()
    })

    it('says what happened and offers Retry when the wallet cannot be loaded', async () => {
      const user = userEvent.setup()
      fetchWallet.mockRejectedValueOnce(new Error('x'))
      renderScreen()
      const alert = await screen.findByText(/could not load your documents/i)
      expect(alert.closest('[role="alert"]')).toBeTruthy()
      fetchWallet.mockResolvedValue([doc()])
      await user.click(screen.getByRole('button', { name: 'Retry' }))
      expect(await screen.findByText('Birth certificate')).toBeInTheDocument()
    })

    it('puts the one action inside the empty state', async () => {
      renderScreen()
      const empty = (await screen.findByText('No documents saved yet.')).closest('div') as HTMLElement
      expect(within(empty).getAllByRole('button', { name: /add a document/i })).toHaveLength(1)
      expect(screen.getAllByRole('button', { name: /add a document/i })).toHaveLength(1)
    })

    it('document cards: a heading, a wrapping name and one primary View button', async () => {
      const longName = 'Maria Magdalena Concepcion de la Santisima Trinidad Villanueva-Reyes y Fernandez'
      fetchWallet.mockResolvedValue([doc({ personName: longName })])
      renderScreen()
      const card = (await screen.findByRole('heading', { level: 3, name: 'Birth certificate' })).closest('li') as HTMLElement
      const name = within(card).getByText(longName)
      expect(name.className).not.toMatch(/truncate/)
      expect(name.className).toMatch(/break-words/)
      const view = within(card).getByRole('button', { name: /view birth certificate/i })
      expect(view).toHaveAttribute('data-slot', 'button')
      expect(view.className).toMatch(/min-h-\[48px\]/)
    })

    it('certificate and request cards carry a status pill with a token pair, an icon and the label', async () => {
      fetchEntries.mockResolvedValue([entry({ status: 'revoked' }), entry({ id: 'e2', registerNumber: 'BAP-2026-0008' })])
      fetchRequests.mockResolvedValue([
        { id: 'r1', referenceNumber: 'CR-1', sacrament: 'baptism', personName: 'Ana Reyes', status: 'submitted', createdAt: '2026-10-05T03:00:00Z' } as CertificateRequest,
        { id: 'r2', referenceNumber: 'CR-2', sacrament: 'baptism', personName: 'Ana Reyes', status: 'declined', declineReason: 'No record', createdAt: '2026-10-05T03:00:00Z' } as CertificateRequest,
      ])
      renderScreen()
      await waitFor(() => expect(screen.getAllByText(/^(Withdrawn|Valid|Submitted|Declined)$/)).toHaveLength(4))
      const pills = screen.getAllByText(/^(Withdrawn|Valid|Submitted|Declined)$/)
      for (const p of pills) {
        const badge = p.closest('[data-slot="badge"]') as HTMLElement
        expect(badge.className).toMatch(/bg-status-(pending|confirmed|rejected|done)-bg/)
        expect(badge.querySelector('svg')).toBeTruthy()
      }
    })

    it('confirms a request cancel in a drawer on a phone', async () => {
      const user = userEvent.setup()
      fetchRequests.mockResolvedValue([
        { id: 'r1', referenceNumber: 'CR-1', sacrament: 'baptism', personName: 'Ana Reyes', status: 'submitted', createdAt: '2026-10-05T03:00:00Z' } as CertificateRequest,
      ])
      renderScreen()
      await user.click(await screen.findByRole('button', { name: /cancel request/i }))
      const dialog = await screen.findByRole('dialog', { name: /cancel this request/i })
      expect(dialog).toHaveAttribute('data-slot', 'drawer-content')
    })

    it('shows the delete confirm as a drawer on a phone and returns focus on Keep it', async () => {
      const user = userEvent.setup()
      fetchWallet.mockResolvedValue([doc()])
      renderScreen()
      const trigger = await screen.findByRole('button', { name: /delete birth certificate/i })
      await user.click(trigger)
      const dialog = await screen.findByRole('dialog', { name: /delete this document/i })
      expect(dialog).toHaveAttribute('data-slot', 'drawer-content')
      await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))
      await waitFor(() => expect(trigger).toHaveFocus())
      expect(del).not.toHaveBeenCalled()
    })

    it('the add form links errors to fields and focuses the first invalid one', async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(await screen.findByRole('button', { name: /add a document/i }))
      await user.click(screen.getByRole('button', { name: /save to wallet/i }))
      const file = screen.getByLabelText(/^file/i)
      await waitFor(() => expect(file).toHaveAttribute('aria-invalid', 'true'))
      expect(file).toHaveFocus()
      expect(file.getAttribute('aria-describedby')).toMatch(/error/)
      expect(screen.getByLabelText(/kind of document/i)).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText(/whose document is this/i)).toHaveAttribute('aria-invalid', 'true')
    })

    it('has no accessibility violations with documents, certificates and requests', async () => {
      fetchWallet.mockResolvedValue([doc(), doc({ id: 'g1', kind: 'other' })])
      fetchEntries.mockResolvedValue([entry({ verifyUrl: 'https://app.test/v' })])
      fetchRequests.mockResolvedValue([
        { id: 'r1', referenceNumber: 'CR-1', sacrament: 'baptism', personName: 'Ana Reyes', status: 'issued', createdAt: '2026-10-05T03:00:00Z', registerEntry: { id: 'e1', registerNumber: 'BAP-2026-0007' } } as CertificateRequest,
      ])
      const { container } = renderScreen()
      await screen.findAllByText('Birth certificate')
      await screen.findByText('CR-1')
      await expectNoA11yViolations(container)
    })

    it('has no accessibility violations when empty, with the form open and on error', async () => {
      const user = userEvent.setup()
      fetchWallet.mockRejectedValue(new Error('x'))
      const { container } = renderScreen()
      await screen.findByText(/could not load your documents/i)
      await expectNoA11yViolations(container)
      fetchWallet.mockResolvedValue([])
      await user.click(screen.getByRole('button', { name: 'Retry' }))
      await user.click(await screen.findByRole('button', { name: /add a document/i }))
      await user.click(screen.getByRole('button', { name: /save to wallet/i }))
      await waitFor(() => expect(screen.getByLabelText(/^file/i)).toHaveAttribute('aria-invalid', 'true'))
      await expectNoA11yViolations(container)
    })
  })
})
