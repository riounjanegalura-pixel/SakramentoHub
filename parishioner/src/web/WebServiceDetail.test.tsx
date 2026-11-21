import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { expectNoA11yViolations } from '../test/a11y'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { WebServiceDetail } from './WebServiceDetail'
import { setViewport } from '../test/viewport'
import { SERVICES } from '../lib/mock/services'
import { useBookingStore } from '../stores/booking-store'
import { fetchRequirements } from '../lib/data/requirements'
import { fetchWallet } from '../lib/data/wallet'
import { fetchServices } from '../lib/data/services'
import type { WalletDocument } from '../lib/types'

vi.mock('../lib/data/services', () => ({ fetchServices: vi.fn() }))
vi.mock('../lib/data/requirements', () => ({ fetchRequirements: vi.fn() }))
vi.mock('../lib/data/wallet', () => ({ fetchWallet: vi.fn() }))
vi.mock('../lib/data/notifications', () => ({ fetchNotifications: vi.fn(async () => []) }))
vi.mock('../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter the Apostle Parish', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

function LocationProbe() {
  return <p data-testid="loc">{useLocation().pathname}</p>
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/services" element={<p>Catalogue</p>} />
          <Route path="/services/:id" element={<WebServiceDetail />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const walletDoc = (kind: WalletDocument['kind']): WalletDocument => ({
  id: 'w1', kind, personName: 'Ana', fileUrl: '/f', originalName: 'a.pdf', mime: 'application/pdf', sizeBytes: 1, createdAt: '2026-10-01T00:00:00Z',
})

const REQS = {
  documents: [
    { key: 'birth', label: "Child's PSA birth certificate", requirement: 'required', condition: null, walletKind: 'birth_certificate' },
    { key: 'misc', label: 'Other note', requirement: 'optional', condition: null, walletKind: 'other' },
  ],
}

describe('WebServiceDetail', () => {
  beforeEach(() => {
    setViewport(1280)
    useBookingStore.getState().reset()
    vi.mocked(fetchServices).mockReset().mockResolvedValue(SERVICES)
    vi.mocked(fetchRequirements).mockReset().mockResolvedValue(REQS as never)
    vi.mocked(fetchWallet).mockReset().mockResolvedValue([walletDoc('birth_certificate'), walletDoc('other')])
  })

  it('shows the service, its facts, documents with wallet ticks and what else to prepare', async () => {
    renderAt('/services/baptism')
    expect(await screen.findByRole('heading', { name: 'Baptism', level: 1 })).toBeInTheDocument()
    expect(screen.getByText("Schedule your child's baptism ceremony")).toBeInTheDocument()
    expect(screen.getAllByText('₱50.00 per sponsor').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Book at least 7 days ahead').length).toBeGreaterThan(0)
    expect(screen.getByText(/Tuesday, Wednesday, Thursday, Friday, Saturday/)).toBeInTheDocument()
    expect(screen.getByText('45 minutes')).toBeInTheDocument()
    const docs = screen.getByRole('region', { name: 'Documents to prepare' })
    const birth = (await within(docs).findByText("Child's PSA birth certificate")).closest('li') as HTMLElement
    expect(within(birth).getByText('Required')).toBeInTheDocument()
    expect(await within(birth).findByText('In your documents')).toBeInTheDocument()
    const misc = within(docs).getByText('Other note').closest('li') as HTMLElement
    expect(within(misc).queryByText('In your documents')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Also prepare' })).getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /All services/ })).toHaveAttribute('href', '/services')
  })

  it('uses the singular for a one day lead time', async () => {
    vi.mocked(fetchServices).mockResolvedValue(SERVICES.map((s) => (s.id === 'baptism' ? { ...s, leadTimeDays: 1 } : s)))
    renderAt('/services/baptism')
    expect((await screen.findAllByText('Book at least 1 day ahead')).length).toBeGreaterThan(0)
  })

  it('starts the booking from the sticky card', async () => {
    renderAt('/services/baptism')
    const card = await screen.findByRole('complementary', { name: 'Book this service' })
    expect(within(card).getByRole('heading', { name: 'Book this service' })).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Start booking' }))
    expect(useBookingStore.getState().sacrament).toBe('baptism')
    expect(await screen.findByTestId('loc')).toHaveTextContent('/booking/baptism/1')
  })

  it('redirects an unknown service to the catalogue', async () => {
    renderAt('/services/nope')
    expect(await screen.findByText('Catalogue')).toBeInTheDocument()
  })

  it('still renders when the wallet cannot be read', async () => {
    vi.mocked(fetchWallet).mockRejectedValue(new Error('x'))
    renderAt('/services/baptism')
    expect(await screen.findByRole('heading', { name: 'Baptism', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText("Child's PSA birth certificate")).toBeInTheDocument()
    expect(screen.queryByText('In your documents')).not.toBeInTheDocument()
  })

  it('says so when the documents list fails', async () => {
    vi.mocked(fetchRequirements).mockRejectedValue(new Error('x'))
    renderAt('/services/baptism')
    expect(await screen.findByText("Couldn't load the documents list.")).toBeInTheDocument()
  })

  it('lists fee, lead time, days and documents before the Start booking button, with no violations', async () => {
    const { container } = renderAt('/services/baptism')
    const start = await screen.findByRole('button', { name: 'Start booking' })
    await screen.findByText("Child's PSA birth certificate")
    const docs = screen.getByRole('region', { name: 'Documents to prepare' })
    expect(Boolean(within(docs).getByRole('list').compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    await expectNoA11yViolations(container)
  })

  it('shows a skeleton while loading', async () => {
    vi.mocked(fetchServices).mockReturnValue(new Promise(() => {}))
    const { container } = renderAt('/services/baptism')
    expect(screen.getByText('Loading service…')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(3)
  })

  it('shows an error with Retry when the service cannot load', async () => {
    vi.mocked(fetchServices).mockRejectedValueOnce(new Error('x'))
    renderAt('/services/baptism')
    expect(await screen.findByText(/Couldn.t load this service/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Baptism', level: 1 })).toBeInTheDocument()
  })

  it('retries the documents list on its own', async () => {
    vi.mocked(fetchRequirements).mockRejectedValueOnce(new Error('x'))
    renderAt('/services/baptism')
    expect(await screen.findByText(/Couldn.t load the documents list/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText("Child's PSA birth certificate")).toBeInTheDocument()
  })
})
