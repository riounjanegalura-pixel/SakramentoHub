import { beforeEach, describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LazyMotion, domMax } from 'motion/react'
import { ServicesScreen } from './ServicesScreen'
import { fetchServices } from '../../lib/data/services'
import { SERVICES } from '../../lib/mock/services'
import { setViewport } from '../../test/viewport'
import { expectNoA11yViolations } from '../../test/a11y'

vi.mock('../../lib/data/services', () => ({ fetchServices: vi.fn().mockResolvedValue([]) }))
vi.mock('../../lib/data/parish', () => ({ fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })) }))

class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

function renderServices() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LazyMotion features={domMax}>
        <MemoryRouter initialEntries={['/services']}>
          <Routes>
            <Route path="/services" element={<ServicesScreen />} />
            <Route path="/services/:id" element={<p>Detail page</p>} />
            <Route path="/certificates/request" element={<p>request form</p>} />
          </Routes>
        </MemoryRouter>
      </LazyMotion>
    </QueryClientProvider>,
  )
}

describe('ServicesScreen', () => {
  beforeEach(() => {
    setViewport(390)
    globalThis.ResizeObserver ??= Observer as unknown as typeof ResizeObserver
    globalThis.IntersectionObserver ??= Observer as unknown as typeof IntersectionObserver
    vi.mocked(fetchServices).mockReset().mockResolvedValue([])
  })

  it('has a secondary entry point to request a certificate copy', async () => {
    vi.mocked(fetchServices).mockResolvedValue(SERVICES)
    renderServices()
    await userEvent.click(await screen.findByRole('link', { name: /request a certificate copy/i }))
    expect(screen.getByText('request form')).toBeInTheDocument()
  })

  it('lists every sacrament as one row that is a link to its page, in one vertical list', async () => {
    vi.mocked(fetchServices).mockResolvedValue(SERVICES)
    renderServices()
    expect(await screen.findByRole('list', { name: 'Sacraments' })).toBeInTheDocument()
    const links = screen.getAllByRole('link').filter((l) => (l.getAttribute('href') ?? '').startsWith('/services/'))
    expect(links).toHaveLength(SERVICES.length)
    // No carousel: nothing is hidden behind a swipe or a Next button.
    expect(screen.queryByRole('region', { name: 'Services' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next service' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: /Baptism/ }))
    expect(await screen.findByText('Detail page')).toBeInTheDocument()
  })

  it('puts Funeral and Anointing of the Sick first, in the urgent block, with no fee line', async () => {
    vi.mocked(fetchServices).mockResolvedValue(SERVICES)
    renderServices()
    const urgent = (await screen.findByRole('heading', { name: 'When it is urgent' })).closest('section')!
    const names = within(within(urgent).getByRole('list', { name: 'Urgent sacraments' })).getAllByRole('link').map((l) => l.textContent)
    const plan = screen.getByRole('heading', { name: 'Plan a sacrament' })
    expect(urgent.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(names).toHaveLength(2)
    expect(names.join(' ')).toMatch(/Funeral/)
    expect(names.join(' ')).toMatch(/Anointing/)
    expect(urgent.textContent).not.toMatch(/Fee:/)
  })

  it('shows the fee only where there is one, as the parish quotes it', async () => {
    vi.mocked(fetchServices).mockResolvedValue(SERVICES)
    renderServices()
    const list = await screen.findByRole('list', { name: 'Sacraments' })
    expect(list.textContent).toMatch(/Fee: ₱50\.00 per sponsor/)
    expect(list.textContent).not.toMatch(/No fee/)
  })

  it('offers the way to call the parish now, above the list', async () => {
    vi.mocked(fetchServices).mockResolvedValue(SERVICES)
    renderServices()
    await screen.findByRole('list', { name: 'Sacraments' })
    expect(await screen.findByTestId('emergency-call')).toBeInTheDocument()
  })

  it('has no accessibility violations once the services are shown', async () => {
    vi.mocked(fetchServices).mockResolvedValue(SERVICES)
    const { container } = renderServices()
    await screen.findByRole('list', { name: 'Sacraments' })
    await expectNoA11yViolations(container)
  })

  it('shows a skeleton in the final shape while loading, with no count line', async () => {
    vi.mocked(fetchServices).mockReturnValue(new Promise(() => {}))
    const { container } = renderServices()
    expect(screen.getByText('Loading services…')).toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(3)
    await expectNoA11yViolations(container)
  })

  it('says nothing is open and what to do when there are no services', async () => {
    const { container } = renderServices()
    expect(await screen.findByText('No services are open for booking right now.')).toBeInTheDocument()
    expect(screen.getByText(/contact the parish office/i)).toBeInTheDocument()
    await expectNoA11yViolations(container)
  })

  it('shows an error with a Retry that fetches again', async () => {
    vi.mocked(fetchServices).mockRejectedValueOnce(new Error('boom')).mockResolvedValue(SERVICES)
    const { container } = renderServices()
    expect(await screen.findByText(/Couldn.t load services/)).toBeInTheDocument()
    await expectNoA11yViolations(container)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('list', { name: 'Sacraments' })).toBeInTheDocument()
    expect(fetchServices).toHaveBeenCalledTimes(2)
  })
})
