import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { WebFrame } from './WebFrame'
import { useAuthStore } from '../stores/auth-store'
import { setViewport } from '../test/viewport'
import { AppHeader } from '../components/shared/AppHeader'
import { expectNoA11yViolations } from '../test/a11y'

vi.mock('../lib/data/notifications', () => ({
  fetchNotifications: vi.fn(async () => [
    { id: 'n1', read: false },
    { id: 'n2', read: true },
  ]),
}))
vi.mock('../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({
    name: 'St. Peter the Apostle Parish',
    phone: '09123456789',
    priestName: 'Fr. X',
    workingHours: { start: '08:00', end: '17:00' },
  })),
}))

const original = window.matchMedia
afterEach(() => {
  window.matchMedia = original
  useAuthStore.setState({ user: null })
})

function Probe() {
  return <p data-testid="loc">{useLocation().pathname}</p>
}

function renderFrame(route = '/calendar', header?: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <WebFrame header={header}>
          <p>body</p>
        </WebFrame>
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WebFrame', () => {
  beforeEach(() => {
    setViewport(1280)
    useAuthStore.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '09170000000', address: '', emailVerifiedAt: '2026-01-01' } as never })
    Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false)
    Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {})
    Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {})
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})
  })

  it('has the four destinations in the top bar and marks the current one', async () => {
    renderFrame('/services')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Home', 'Book', 'My bookings', 'Account'])
    expect(within(nav).getByRole('link', { name: 'Book' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/booking/history')
  })

  it('shows the unread count on the notifications link', async () => {
    renderFrame()
    expect(await screen.findByRole('link', { name: 'Notifications, 1 unread' })).toHaveAttribute('href', '/notifications')
  })

  it('has an account menu with Profile, Documents, Settings, Help and Sign out', async () => {
    renderFrame()
    await userEvent.click(await screen.findByRole('button', { name: 'Rita Reyes' }))
    expect(await screen.findByRole('menuitem', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Documents' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Help' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('signs out and goes to the sign-in page', async () => {
    const logout = vi.fn(async () => {
      useAuthStore.setState({ user: null })
    })
    useAuthStore.setState({ logout } as never)
    renderFrame()
    await userEvent.click(await screen.findByRole('button', { name: 'Rita Reyes' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('/login')).toBeInTheDocument()
  })

  it('shows the parish name, phone and hours in the footer, with Privacy and Verify links', async () => {
    renderFrame()
    const footer = await screen.findByRole('contentinfo')
    expect(await within(footer).findByRole('link', { name: '09123456789' })).toHaveAttribute('href', 'tel:09123456789')
    expect(footer).toHaveTextContent('St. Peter the Apostle Parish')
    expect(footer).toHaveTextContent('8:00 AM – 5:00 PM')
    expect(within(footer).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    expect(within(footer).getByRole('link', { name: 'Verify a certificate' })).toHaveAttribute('href', '/verify')
  })

  it('signed out, shows only the brand and a Sign in link, with no guarded nav, notifications or account menu', async () => {
    useAuthStore.setState({ user: null })
    renderFrame('/privacy')
    const signIn = await screen.findByRole('link', { name: 'Sign in' })
    expect(signIn).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'SakramentoHub' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Notifications/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rita Reyes' })).not.toBeInTheDocument()
  })

  it('keeps the content column at most 960 px by default', async () => {
    renderFrame()
    expect(await screen.findByRole('main')).toHaveClass('max-w-[960px]')
  })

  it('renders the screen header as a plain page heading with its action on the right, not a glass card', async () => {
    renderFrame('/services', <AppHeader title="Services" subtitle="Pick one" onBack={() => {}} action={<button>Edit</button>} />)
    const main = await screen.findByRole('main')
    const h1 = within(main).getByRole('heading', { level: 1, name: 'Services' })
    expect(h1).toHaveClass('font-display', 'text-ink')
    expect(within(main).getByText('Pick one')).toBeInTheDocument()
    expect(within(main).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(main).getByRole('button', { name: 'Go back' })).toBeInTheDocument()
    expect(screen.getAllByRole('banner')).toHaveLength(1)
    expect(main.querySelector('.bg-glass')).toBeNull()
    expect(main.querySelector('[data-testid="brand-mark"]')).toBeNull()
  })

  it('has header, main and footer landmarks and no phone chrome marker', async () => {
    renderFrame('/services', <AppHeader title="Services" />)
    expect(await screen.findByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(document.querySelector('[data-chrome]')).toBeNull()
    expect(document.querySelector('[data-app-shell]')).toBeNull()
  })

  it('has no accessibility violations as a whole page', async () => {
    const { container } = renderFrame('/services', <AppHeader title="Services" action={<button>Edit</button>} />)
    await screen.findByRole('link', { name: '09123456789' })
    await expectNoA11yViolations(container, { fullPage: true })
  })
})
