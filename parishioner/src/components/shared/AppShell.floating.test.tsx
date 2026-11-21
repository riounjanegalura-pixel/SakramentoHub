import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AppShell } from './AppShell'
import { setViewport } from '../../test/viewport'
import { useAuthStore } from '../../stores/auth-store'

vi.mock('../../lib/data/notifications', () => ({ fetchNotifications: vi.fn(async () => []) }))
vi.mock('../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter the Apostle Parish', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

const original = window.matchMedia
afterEach(() => {
  window.matchMedia = original
  useAuthStore.setState({ user: null })
})

const shell = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )

describe('AppShell floating', () => {
  it('draws the floating node inside the shell but outside the animated main', () => {
    setViewport(390)
    shell(
      <AppShell floating={<button type="button">Support</button>}>
        <p>body</p>
      </AppShell>,
    )
    const fab = screen.getByRole('button', { name: 'Support' })
    const main = screen.getByText('body').closest('main')!
    expect(main).not.toContainElement(fab)
    expect(fab.closest('[data-app-shell]')).not.toBeNull()
  })

  it('still draws the floating node in the website frame', () => {
    setViewport(1280)
    useAuthStore.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '' } as never })
    shell(
      <AppShell floating={<button type="button">Support</button>}>
        <p>body</p>
      </AppShell>,
    )
    expect(screen.getByRole('button', { name: 'Support' })).toBeInTheDocument()
    setViewport(390)
  })
})
