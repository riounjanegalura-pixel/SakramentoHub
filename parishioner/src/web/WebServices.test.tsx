import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expectNoA11yViolations } from '../test/a11y'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { WebServices } from './WebServices'
import { setViewport } from '../test/viewport'
import { fetchServices } from '../lib/data/services'
import { SERVICES } from '../lib/mock/services'
import { feeText } from '../features/services/serviceText'

vi.mock('../lib/data/services', () => ({ fetchServices: vi.fn() }))
vi.mock('../lib/data/notifications', () => ({ fetchNotifications: vi.fn(async () => []) }))
vi.mock('../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter the Apostle Parish', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/services']}>
        <WebServices />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WebServices', () => {
  beforeEach(() => {
    setViewport(1280)
    vi.mocked(fetchServices).mockReset().mockResolvedValue(SERVICES)
  })

  it('lists every service as a link to its page, planned ones as emblem tiles four to a row, under the page title', async () => {
    const { container } = renderPage()
    expect(screen.getByRole('heading', { name: 'Book a sacrament', level: 1 })).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Sacraments' })
    expect(list.className).toMatch(/\bgrid-cols-2\b/)
    expect(list.className).toMatch(/lg:grid-cols-4/)
    const links = screen.getAllByRole('link').filter((l) => (l.getAttribute('href') ?? '').startsWith('/services/'))
    expect(links).toHaveLength(SERVICES.length)
    // The urgent two come first, so the first planned service is not the first link.
    expect(links.map((l) => l.getAttribute('href'))).toContain(`/services/${SERVICES[0].id}`)
    expect(within(list).getByText(`Fee: ${feeText(SERVICES[0])}`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next service' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Request a certificate copy/ })).toHaveAttribute('href', '/certificates/request')
    await expectNoA11yViolations(container)
  })

  it('shows a skeleton grid while loading', async () => {
    vi.mocked(fetchServices).mockReturnValue(new Promise(() => {}))
    const { container } = renderPage()
    expect(screen.getByText('Loading services…')).toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(3)
    await expectNoA11yViolations(container)
  })

  it('says nothing is open when there are no services', async () => {
    vi.mocked(fetchServices).mockResolvedValue([])
    const { container } = renderPage()
    expect(await screen.findByText('No services are open for booking right now.')).toBeInTheDocument()
    await expectNoA11yViolations(container)
  })

  it('shows an error with a Retry that fetches again', async () => {
    vi.mocked(fetchServices).mockRejectedValueOnce(new Error('x')).mockResolvedValue(SERVICES)
    const { container } = renderPage()
    expect(await screen.findByText(/Couldn.t load services/)).toBeInTheDocument()
    await expectNoA11yViolations(container)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('list', { name: 'Sacraments' })).toBeInTheDocument()
  })
})
