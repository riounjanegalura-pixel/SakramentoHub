import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ServiceDetailScreen } from './ServiceDetailScreen'
import { ServicesScreen } from './ServicesScreen'
import { SERVICES } from '../../lib/mock/services'
import { useBookingStore } from '../../stores/booking-store'
import { fetchRequirements } from '../../lib/mock/requirements'
import { setViewport } from '../../test/viewport'
import { expectNoA11yViolations } from '../../test/a11y'
import { fetchServices as fetchServicesData } from '../../lib/data/services'
import { fetchRequirements as fetchRequirementsData } from '../../lib/data/requirements'
import type { WalletDocument } from '../../lib/types'

vi.mock('../../lib/data/services', async () => {
  const m = await import('../../lib/mock/services')
  return { fetchServices: vi.fn(async () => m.SERVICES), fetchService: async (id: string) => m.SERVICES.find((s) => s.id === id) }
})
vi.mock('../../lib/data/requirements', async () => {
  const m = await import('../../lib/mock/requirements')
  return { fetchRequirements: vi.fn(async (id: string) => m.fetchRequirements(id)) }
})
const fetchWallet = vi.fn<() => Promise<WalletDocument[]>>()
vi.mock('../../lib/data/wallet', () => ({ fetchWallet: () => fetchWallet() }))
vi.mock('../../lib/mock/latency', async (orig) => ({ ...(await orig<object>()), simulateLatency: async () => {} }))

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/services" element={<ServicesScreen />} />
          <Route path="/services/:id" element={<ServiceDetailScreen />} />
          <Route path="/booking/:sacrament/:step" element={<p>Wizard step</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

const walletDoc = (kind: WalletDocument['kind']): WalletDocument => ({
  id: 'w1', kind, personName: 'Ana', fileUrl: '/f', originalName: 'a.pdf', mime: 'application/pdf', sizeBytes: 1, createdAt: '2026-10-01T00:00:00Z',
})

describe('ServiceDetailScreen', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const m = await import('../../lib/mock/services')
    const r = await import('../../lib/mock/requirements')
    vi.mocked(fetchServicesData).mockImplementation(async () => m.SERVICES)
    vi.mocked(fetchRequirementsData).mockImplementation(async (id: string) => r.fetchRequirements(id))
    setViewport(390)
    globalThis.ResizeObserver ??= Observer as unknown as typeof ResizeObserver
    globalThis.IntersectionObserver ??= Observer as unknown as typeof IntersectionObserver
    useBookingStore.getState().reset()
    fetchWallet.mockResolvedValue([])
  })

  it('shows the baptism page: fee per sponsor, lead time, days, duration, documents and what else to prepare', async () => {
    renderAt('/services/baptism')
    expect(await screen.findByRole('heading', { name: 'Baptism' })).toBeInTheDocument()
    expect(screen.getByText("Schedule your child's baptism ceremony")).toBeInTheDocument()
    expect(screen.getByText('₱50.00 per sponsor')).toBeInTheDocument()
    expect(screen.getByText('Book at least 7 days ahead')).toBeInTheDocument()
    expect(screen.getByText(/Tuesday, Wednesday, Thursday, Friday, Saturday/)).toBeInTheDocument()
    expect(screen.getByText(/Group session on Sunday at 10:00 AM/)).toBeInTheDocument()
    expect(screen.getByText('45 minutes')).toBeInTheDocument()
    await screen.findByText('PSA birth certificate')
    const docs = screen.getByRole('region', { name: 'Documents to prepare' })
    const birth = within(docs).getByText('PSA birth certificate').closest('li') as HTMLElement
    expect(within(birth).getByText('Optional')).toBeInTheDocument()
    expect(within(docs).queryByText(/required/i)).not.toBeInTheDocument()
    const also = screen.getByRole('region', { name: 'Also prepare' })
    expect(within(also).getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  it('shows the wedding page with its sixteen documents, conditional and optional wording', async () => {
    renderAt('/services/wedding')
    await screen.findByText("Groom's CENOMAR")
    const docs = screen.getByRole('region', { name: 'Documents to prepare' })
    expect(within(docs).getAllByRole('listitem')).toHaveLength(16)
    expect(within(docs).getByText('Required if the groom is widowed')).toBeInTheDocument()
    expect(within(docs).getByText("Required if the bride's previous marriage was annulled")).toBeInTheDocument()
    expect(within(docs).getAllByText('Optional').length).toBeGreaterThan(0)
    expect(screen.getByText('₱5,000.00')).toBeInTheDocument()
    expect(screen.getByText('Book at least 2 days ahead')).toBeInTheDocument()
  })

  it('ticks documents the wallet already holds', async () => {
    fetchWallet.mockResolvedValue([walletDoc('birth_certificate')])
    renderAt('/services/baptism')
    await screen.findByText('PSA birth certificate')
    const docs = screen.getByRole('region', { name: 'Documents to prepare' })
    const birth = within(docs).getByText('PSA birth certificate').closest('li') as HTMLElement
    expect(await within(birth).findByText('In your documents')).toBeInTheDocument()
    const contract = within(docs).getByText("Parents' marriage contract").closest('li') as HTMLElement
    expect(within(contract).queryByText('In your documents')).not.toBeInTheDocument()
  })

  it('still renders, with no ticks, when the wallet cannot be loaded', async () => {
    fetchWallet.mockRejectedValue(new Error('nope'))
    renderAt('/services/baptism')
    expect(await screen.findByText('PSA birth certificate')).toBeInTheDocument()
    expect(screen.queryByText('In your documents')).not.toBeInTheDocument()
    expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument()
  })

  it('says no documents are needed, no fee, and omits lead time when it is zero', async () => {
    renderAt('/services/anointing')
    expect(await screen.findByText('No documents needed.')).toBeInTheDocument()
    expect(screen.getByText('No fee')).toBeInTheDocument()
    expect(screen.queryByText(/Book at least/)).not.toBeInTheDocument()
  })

  it('Start booking starts the draft and opens step 1', async () => {
    const user = userEvent.setup()
    renderAt('/services/funeral')
    await user.click(await screen.findByRole('button', { name: 'Start booking' }))
    expect(await screen.findByText('Wizard step')).toBeInTheDocument()
    expect(useBookingStore.getState().sacrament).toBe('funeral')
  })

  it('an unknown id goes back to the Book list', async () => {
    renderAt('/services/nonsense')
    expect(await screen.findByRole('list', { name: 'Sacraments' })).toBeInTheDocument()
  })

  it('the Services list opens the page instead of starting the booking', async () => {
    const user = userEvent.setup()
    renderAt('/services')
    await user.click(await screen.findByText(SERVICES[0].name))
    expect(await screen.findByRole('button', { name: 'Start booking' })).toBeInTheDocument()
    expect(useBookingStore.getState().sacrament).toBeNull()
  })

  it('mock catalogue covers every service', async () => {
    for (const s of SERVICES) expect((await fetchRequirements(s.id)).serviceId).toBe(s.id)
  })

  it('puts fee, lead time, days and the documents list before the Start booking button', async () => {
    const { container } = renderAt('/services/baptism')
    const start = await screen.findByRole('button', { name: 'Start booking' })
    await screen.findByText('PSA birth certificate')
    const before = (el: Element) => Boolean(el.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(screen.getByText('Fee'))).toBe(true)
    expect(before(screen.getByText('Lead time'))).toBe(true)
    expect(before(screen.getByText('Days offered'))).toBe(true)
    const docs = screen.getByRole('region', { name: 'Documents to prepare' })
    expect(before(within(docs).getByRole('list'))).toBe(true)
    await expectNoA11yViolations(container)
  })

  it('draws the Start booking footer through the shell floating slot, outside the animated main', async () => {
    renderAt('/services/baptism')
    const start = await screen.findByRole('button', { name: 'Start booking' })
    expect(screen.getByRole('main')).not.toContainElement(start)
    expect(start.className).toMatch(/bg-gold/)
    expect(start.className).toMatch(/text-navy/)
    expect(start.closest('[data-slot="service-footer"]')?.className).toMatch(/\bfixed\b/)
  })

  it('opens What to bring with the same list, and returns focus when it closes', async () => {
    const user = userEvent.setup()
    const { baseElement } = renderAt('/services/baptism')
    await screen.findByText('PSA birth certificate')
    const trigger = screen.getByRole('button', { name: 'What to bring' })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'What to bring' })
    expect(within(dialog).getByRole('list', { name: 'Documents' })).toBeInTheDocument()
    expect(within(dialog).getByText('PSA birth certificate')).toBeInTheDocument()
    await expectNoA11yViolations(baseElement as HTMLElement)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('shows a skeleton in the final shape while the service loads', async () => {
    vi.mocked(fetchServicesData).mockReturnValue(new Promise(() => {}))
    const { container } = renderAt('/services/baptism')
    expect(screen.getByText('Loading service…')).toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(3)
    await expectNoA11yViolations(container)
  })

  it('shows an error with Retry when the service cannot load', async () => {
    vi.mocked(fetchServicesData).mockRejectedValueOnce(new Error('x'))
    const { container } = renderAt('/services/baptism')
    expect(await screen.findByText(/Couldn.t load this service/)).toBeInTheDocument()
    await expectNoA11yViolations(container)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Baptism' })).toBeInTheDocument()
  })

  it('shows a documents skeleton, then an error with Retry for the documents list', async () => {
    vi.mocked(fetchRequirementsData).mockRejectedValueOnce(new Error('x'))
    renderAt('/services/baptism')
    expect(await screen.findByText(/Couldn.t load the documents list/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('PSA birth certificate')).toBeInTheDocument()
  })

  it('says no documents are needed, as a states check with no violations', async () => {
    const { container } = renderAt('/services/anointing')
    expect(await screen.findByText('No documents needed.')).toBeInTheDocument()
    expect(screen.getByText('No minimum lead time')).toBeInTheDocument()
    await expectNoA11yViolations(container)
  })
})
