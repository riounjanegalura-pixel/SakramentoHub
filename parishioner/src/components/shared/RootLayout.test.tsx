import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LazyMotion, domMax } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { RootLayout } from './RootLayout'
import { AppShell } from './AppShell'
import { AppHeader } from './AppHeader'
import { setViewport } from '../../test/viewport'
import { expectNoA11yViolations } from '../../test/a11y'
import { useAuthStore } from '../../stores/auth-store'

// The page entry reads useReducedMotion; each case sets it (default: motion allowed).
const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motion.reduced,
}))
vi.mock('../../lib/data/notifications', () => ({ fetchNotifications: vi.fn(async () => []) }))
vi.mock('../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter the Apostle Parish', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

const original = window.matchMedia
beforeEach(() => {
  motion.reduced = false
})
afterEach(() => {
  window.matchMedia = original
  useAuthStore.setState({ user: null })
})

const page = (title: string, body: string, showBottomNav = true) => (
  <AppShell showBottomNav={showBottomNav} header={<AppHeader title={title} />}>
    <p>{body}</p>
  </AppShell>
)

function renderApp(path: string, width = 390) {
  setViewport(width)
  const memory = createMemoryRouter(
    [
      {
        element: <RootLayout />,
        // A component per route, as the real lazy routes have, so a route change remounts the screen and its AppShell.
        children: [
          { path: '/home', Component: () => page('Home', 'home body') },
          { path: '/calendar', Component: () => page('Calendar', 'calendar body') },
          { path: '/services', Component: () => page('Services', 'services body') },
          { path: '/wizard', Component: () => page('Baptism', 'wizard body', false) },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <LazyMotion features={domMax} strict>
        <RouterProvider router={memory} />
      </LazyMotion>
    </QueryClientProvider>,
  )
  return Object.assign(view, { memory })
}

const go = (memory: ReturnType<typeof createMemoryRouter>, to: string) => act(() => memory.navigate(to))

describe('RootLayout (the persistent phone shell)', () => {
  it('keeps one bottom bar mounted across tab routes, and the active rule moves to the new tab', async () => {
    const user = userEvent.setup()
    renderApp('/home')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(screen.getByRole('link', { name: 'Home' })).getByTestId('tab-rule')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Book' }))
    expect(await screen.findByRole('heading', { name: 'Services' })).toBeInTheDocument()

    expect(screen.getByRole('navigation', { name: 'Main' })).toBe(nav)
    expect(screen.getAllByTestId('tab-rule')).toHaveLength(1)
    expect(within(screen.getByRole('link', { name: 'Book' })).getByTestId('tab-rule')).toBeInTheDocument()
  })

  it('hides the bar on a screen that does not want it, and brings the same layout back after', async () => {
    const { memory } = renderApp('/home')
    await screen.findByRole('navigation', { name: 'Main' })
    await go(memory, '/wizard')
    expect(await screen.findByRole('heading', { name: 'Baptism' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    await go(memory, '/home')
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('has a skip link first in the tab order that targets #main and moves focus there', async () => {
    const user = userEvent.setup()
    renderApp('/home')
    const skip = await screen.findByRole('link', { name: 'Skip to main content' })
    expect(skip).toHaveAttribute('href', '#main')
    expect(skip).toHaveClass('sr-only')
    expect(skip.className).toContain('focus:not-sr-only')

    await user.tab()
    expect(skip).toHaveFocus()

    const main = document.getElementById('main')!
    expect(main.tagName).toBe('MAIN')
    expect(main).toHaveAttribute('tabindex', '-1')
    expect(main).toHaveTextContent('home body')
    await user.keyboard('{Enter}')
    expect(main).toHaveFocus()
  })

  it('on a route change moves focus to the new h1 and announces the title; not on first load or a search-param change', async () => {
    const { memory } = renderApp('/home')
    await screen.findByRole('heading', { name: 'Home' })
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    // First load: focus stays where the browser put it, nothing is announced.
    expect(document.body).toHaveFocus()
    expect(status).toHaveTextContent('')

    await go(memory, '/calendar')
    const heading = await screen.findByRole('heading', { name: 'Calendar' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(status).toHaveTextContent('Calendar')

    const skip = screen.getByRole('link', { name: 'Skip to main content' })
    act(() => skip.focus())
    await go(memory, '/calendar?month=2030-01')
    expect(memory.state.location.search).toBe('?month=2030-01')
    expect(skip).toHaveFocus()
  })

  it('shows the new page at once after a navigation: the frame never fades or moves (client revision, Nov 2026)', async () => {
    const { memory } = renderApp('/home')
    await screen.findByRole('heading', { name: 'Home' })
    await go(memory, '/calendar')
    const next = await screen.findByRole('heading', { name: 'Calendar' })
    expect(next.closest('[style*="opacity"]')).toBeNull()
    expect(within(screen.getByRole('main')).getByText('calendar body')).toBeVisible()
  })

  it('on a desktop renders no bottom bar and the same website frame as before', async () => {
    useAuthStore.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '' } as never })
    renderApp('/home', 1280)
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    // The only Main navigation is the top bar's; the phone tab bar is not drawn.
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(1)
    expect(screen.getByRole('banner')).toContainElement(screen.getByRole('navigation', { name: 'Main' }))
    expect(document.querySelector('[data-app-shell]')).toBeNull()
    expect(screen.getByText('home body').closest('main')).toHaveClass('max-w-[960px]')
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeInTheDocument()
  })

  it('has no axe violations with a page inside', async () => {
    const { container } = renderApp('/home')
    await screen.findByRole('navigation', { name: 'Main' })
    await expectNoA11yViolations(container, { fullPage: true })
  })
})
