import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WizardContext } from '../booking/wizard/WizardContext'
import { wizardFor } from '../booking/wizard/registry'
import { useBookingStore } from '../../stores/booking-store'
import type { RequirementDocument, Sacrament, WalletDocument } from '../../lib/types'
import { expectNoA11yViolations } from '../../test/a11y'

const fetchWallet = vi.fn<() => Promise<WalletDocument[]>>()
const addByUrl = vi.fn()
vi.mock('../../lib/data/wallet', () => ({
  fetchWallet: () => fetchWallet(),
  addWalletDocumentByUrl: (...a: unknown[]) => addByUrl(...a),
  addWalletDocumentFile: vi.fn(),
  deleteWalletDocument: vi.fn(),
}))
const fetchRequirements = vi.fn()
vi.mock('../../lib/data/requirements', () => ({ fetchRequirements: (...a: unknown[]) => fetchRequirements(...a) }))
const uploadDocument = vi.fn()
vi.mock('../../lib/data/documents', () => ({ uploadDocument: (...a: unknown[]) => uploadDocument(...a), fetchDocumentFile: vi.fn() }))
vi.mock('../../lib/data/bookings', () => ({ fetchBooking: vi.fn() }))

const req = (key: string, walletKind: RequirementDocument['walletKind']): RequirementDocument => ({
  key, label: key, walletKind, requirement: 'required', condition: null,
})
const wdoc = (over: Partial<WalletDocument>): WalletDocument => ({
  id: 'w1', kind: 'birth_certificate', personName: 'Ana Reyes', fileUrl: '/documents/u1/a.pdf', originalName: 'a.pdf',
  mime: 'application/pdf', sizeBytes: 1, createdAt: new Date().toISOString(), ...over,
})
const monthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString() }

function renderStep(sacrament: Sacrament, mode: 'online' | 'desk' = 'online') {
  const definition = wizardFor(sacrament)!
  const step = definition.steps.find((s) => s.id === 'documents')!
  const Step = step.Component
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <WizardContext.Provider value={{ definition, stepIndex: 4, total: 6, next: vi.fn(), goTo: vi.fn(), cancel: vi.fn(), stepId: 'documents', mode, registerDraft: () => {} }}>
        <Step step={step} />
      </WizardContext.Provider>
    </QueryClientProvider>,
  )
}

// The step keeps its answers in its form until the shell saves them; unmounting saves them, as leaving the step does.
const committed = (view: { unmount: () => void }, key: string) => {
  view.unmount()
  return useBookingStore.getState().formData[key]
}
const input = (id: string) => document.getElementById(id) as HTMLInputElement
const pdf = (name = 'new.pdf') => new File(['x'], name, { type: 'application/pdf' })

describe('Documents step with the wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchWallet.mockResolvedValue([])
    fetchRequirements.mockResolvedValue({ serviceId: 'baptism', documents: [req('birthCertificate', 'birth_certificate'), req('marriageContract', 'marriage_contract')] })
  })

  it('offers only wallet documents whose kind matches the tile and fills the field with the chosen fileUrl', async () => {
    const user = userEvent.setup()
    useBookingStore.getState().startBooking('baptism')
    fetchWallet.mockResolvedValue([
      wdoc({ id: 'a', personName: 'Ana Reyes', fileUrl: '/documents/u1/ana.pdf', createdAt: '2026-10-05T03:00:00Z' }),
      wdoc({ id: 'b', kind: 'marriage_contract', personName: 'The Reyes couple', fileUrl: '/documents/u1/m.pdf' }),
    ])
    const view = renderStep('baptism')
    const buttons = await screen.findAllByRole('button', { name: /choose from wallet/i })
    expect(buttons).toHaveLength(2) // one per tile; each has a matching document
    await user.click(buttons[0])
    expect(await screen.findByText('Ana Reyes')).toBeInTheDocument()
    expect(screen.getByText('Added Oct 5, 2026')).toBeInTheDocument()
    expect(screen.queryByText('The Reyes couple')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /ana reyes/i }))
    expect(committed(view, 'birthCertificate')).toBe('/documents/u1/ana.pdf')
    expect(screen.queryByText(/usually ask for a copy/i)).not.toBeInTheDocument()
  })

  it('does not show the option when no wallet document matches', async () => {
    useBookingStore.getState().startBooking('baptism')
    fetchWallet.mockResolvedValue([wdoc({ kind: 'cenomar' })])
    renderStep('baptism')
    await screen.findByText(/PSA birth certificate/i)
    await waitFor(() => expect(fetchWallet).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /choose from wallet/i })).not.toBeInTheDocument()
  })

  it('works unchanged when the requirements fail to load', async () => {
    useBookingStore.getState().startBooking('baptism')
    fetchRequirements.mockRejectedValue(new Error('down'))
    fetchWallet.mockResolvedValue([wdoc({})])
    uploadDocument.mockResolvedValue({ url: '/documents/u1/new.pdf' })
    const view = renderStep('baptism')
    await screen.findByText(/PSA birth certificate/i)
    await userEvent.upload(input('birthCertificate'), pdf())
    await screen.findByText('new.pdf')
    expect(screen.queryByRole('button', { name: /choose from wallet/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/keep a copy in my wallet/i)).not.toBeInTheDocument()
    expect(committed(view, 'birthCertificate')).toBe('/documents/u1/new.pdf')
  })

  it('has no keep-a-copy checkbox: the wallet is filled from the Wallet screen, not from a booking', async () => {
    useBookingStore.getState().startBooking('baptism')
    uploadDocument.mockResolvedValue({ url: '/documents/u1/new.pdf' })
    renderStep('baptism')
    await screen.findByText(/PSA birth certificate/i)
    await userEvent.upload(input('birthCertificate'), pdf())
    await screen.findByText('new.pdf')
    expect(screen.queryByLabelText(/keep a copy in my wallet/i)).not.toBeInTheDocument()
  })

  describe('stale document warning', () => {
    const weddingReq = { serviceId: 'wedding', documents: [req('groomBaptismalCertificate', 'baptismal_certificate'), req('groomCenomar', 'cenomar'), req('groomSpouseDeathCertificate', 'death_certificate')] }

    async function choose(kind: WalletDocument['kind'], months: number, sacrament: Sacrament) {
      const user = userEvent.setup()
      useBookingStore.getState().startBooking(sacrament)
      fetchRequirements.mockResolvedValue(
        sacrament === 'wedding' ? weddingReq : { serviceId: 'confirmation', documents: [req('baptismalCertificate', 'baptismal_certificate')] },
      )
      fetchWallet.mockResolvedValue([wdoc({ kind, createdAt: monthsAgo(months), personName: 'Old Doc' })])
      const view = renderStep(sacrament)
      await user.click((await screen.findAllByRole('button', { name: /choose from wallet/i }))[0])
      await user.click(await screen.findByRole('button', { name: /old doc/i }))
      return view
    }

    it('warns for an old baptismal certificate on a wedding', async () => {
      await choose('baptismal_certificate', 7, 'wedding')
      expect(await screen.findByText('Parishes usually ask for a copy issued within the last 6 months.')).toBeInTheDocument()
    })

    it('warns for an old CENOMAR on a wedding', async () => {
      await choose('cenomar', 8, 'wedding')
      expect(await screen.findByText(/usually ask for a copy issued within the last 6 months/i)).toBeInTheDocument()
    })

    it('does not warn for a recent one', async () => {
      const view = await choose('baptismal_certificate', 2, 'wedding')
      expect(committed(view, 'groomBaptismalCertificate')).toBeTruthy()
      expect(screen.queryByText(/usually ask for a copy/i)).not.toBeInTheDocument()
    })

    it('does not warn for another kind, even if old', async () => {
      const view = await choose('death_certificate', 24, 'wedding')
      expect(committed(view, 'groomSpouseDeathCertificate')).toBeTruthy()
      expect(screen.queryByText(/usually ask for a copy/i)).not.toBeInTheDocument()
    })

    it('does not warn for another sacrament', async () => {
      const view = await choose('baptismal_certificate', 12, 'confirmation')
      expect(committed(view, 'baptismalCertificate')).toBeTruthy()
      expect(screen.queryByText(/usually ask for a copy/i)).not.toBeInTheDocument()
    })
  })

  it('hides the wallet options in office-desk mode', async () => {
    useBookingStore.getState().startBooking('baptism')
    fetchWallet.mockResolvedValue([wdoc({})])
    uploadDocument.mockResolvedValue({ url: '/documents/u1/new.pdf' })
    const view = renderStep('baptism', 'desk')
    await screen.findByText(/PSA birth certificate/i)
    await userEvent.upload(input('birthCertificate'), pdf())
    await screen.findByText('new.pdf')
    expect(screen.queryByRole('button', { name: /choose from wallet/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/keep a copy in my wallet/i)).not.toBeInTheDocument()
    expect(fetchWallet).not.toHaveBeenCalled()
    expect(fetchRequirements).not.toHaveBeenCalled()
    expect(committed(view, 'birthCertificate')).toBe('/documents/u1/new.pdf')
  })

  it('has no accessibility violations with the wallet picker open', async () => {
    const user = userEvent.setup()
    useBookingStore.getState().startBooking('baptism')
    fetchWallet.mockResolvedValue([wdoc({})])
    const view = renderStep('baptism')
    await screen.findByText(/PSA birth certificate/i)
    await expectNoA11yViolations(view.container)
    await user.click((await screen.findAllByRole('button', { name: /choose from wallet/i }))[0])
    await expectNoA11yViolations(view.container)
  })
})
