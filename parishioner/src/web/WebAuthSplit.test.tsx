import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { WebAuthSplit } from './WebAuthSplit'
import { fetchNotifications } from '../lib/data/notifications'
import { fetchBookings } from '../lib/data/bookings'
import { useAuthStore } from '../stores/auth-store'
import { expectNoA11yViolations } from '../test/a11y'

vi.mock('../lib/data/notifications', () => ({ fetchNotifications: vi.fn(async () => []) }))
vi.mock('../lib/data/bookings', () => ({ fetchBookings: vi.fn(async () => []) }))

vi.mock('../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter the Apostle Parish', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

describe('WebAuthSplit', () => {
  it('shows the brand panel beside the form', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <WebAuthSplit>
            <h1>Sign In</h1>
          </WebAuthSplit>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const panel = screen.getByRole('complementary', { name: 'About SakramentoHub' })
    expect(await within(panel).findByText('St. Peter the Apostle Parish')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Verify a certificate' })).toHaveAttribute('href', '/verify')
    expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument()
  })

  it('is a navy brand panel on the left and a plain paper form column on the right, with tokens only', async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <WebAuthSplit>
            <h1>Sign In</h1>
          </WebAuthSplit>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const panel = screen.getByRole('complementary', { name: 'About SakramentoHub' })
    expect(panel).toHaveClass('bg-navy', 'text-white')
    expect(screen.getByRole('main')).toHaveClass('bg-paper')
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(container.innerHTML).not.toMatch(/brand-/)
    await within(panel).findByText('St. Peter the Apostle Parish')
    await expectNoA11yViolations(container, { fullPage: true })
  })

  it('asks for no notifications or bookings (no signed-in chrome)', async () => {
    // A signed-in user makes the chrome's queries run if the page ever renders it.
    useAuthStore.setState({ user: { id: 'u1', fullName: 'Rita', email: 'r@x.org', phone: '', address: '' } as never })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <WebAuthSplit>
            <h1>Sign In</h1>
          </WebAuthSplit>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await within(screen.getByRole('complementary', { name: 'About SakramentoHub' })).findByText('St. Peter the Apostle Parish')
    expect(fetchNotifications).not.toHaveBeenCalled()
    expect(fetchBookings).not.toHaveBeenCalled()
    useAuthStore.setState({ user: null })
  })
})
