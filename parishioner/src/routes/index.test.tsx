import { afterEach, describe, it, expect, vi } from 'vitest'
import { configure, render, screen, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import { router } from './index'
import { useAuthStore } from '../stores/auth-store'
import { setViewport } from '../test/viewport'

// A screen's chunk is imported on first visit; in a cold test run that includes transforming the module.
configure({ asyncUtilTimeout: 10_000 })

// jsdom has no layout observers.
class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
globalThis.ResizeObserver ??= Observer as unknown as typeof ResizeObserver
globalThis.IntersectionObserver ??= Observer as unknown as typeof IntersectionObserver

vi.mock('../lib/data/notifications', () => ({ fetchNotifications: vi.fn(async () => []) }))
vi.mock('../lib/data/bookings', async (orig) => ({
  ...(await orig<typeof import('../lib/data/bookings')>()),
  fetchBookings: vi.fn(async () => [
    { id: 'b1', referenceNumber: 'WEDD-1', userId: 'u1', sacrament: 'wedding', status: 'approved', statusLabel: 'Approved', formData: {}, appointmentDate: '2030-01-08', appointmentStart: '10:00', appointmentEnd: '11:00', isEmergency: false, paymentStatus: 'not_required', amountDueCentavos: 0, paymentHoldExpiresAt: null, paidAt: null, paymentReference: null, refundReference: null, refundedAt: null, statusReason: null, returnNote: null, createdAt: '2026-11-02T00:00:00Z' },
  ]),
}))
vi.mock('../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter the Apostle Parish', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

const originalMatchMedia = window.matchMedia
afterEach(() => {
  window.matchMedia = originalMatchMedia
  useAuthStore.setState({ user: null })
})

function renderAt(path: string, width: number, signedIn = true) {
  setViewport(width)
  useAuthStore.setState({ user: signedIn ? { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '', emailVerifiedAt: '2026-01-01' } as never : null, isBootstrapping: false } as never)
  const memory = createMemoryRouter(router.routes, { initialEntries: [path] })
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={memory} />
    </QueryClientProvider>,
  )
  return Object.assign(view, { memory })
}

// A route path with its params filled in, so it can be visited.
function concrete(path: string) {
  return path.replace(':sacrament', 'baptism').replace(':step', '1').replace(':number', 'N1').replace(':code', 'C1').replace(':id', '1')
}

const publicPaths = new Set(['/', '/login', '/register', '/privacy', '/forgot-password', '/reset-password', '/verify-email', '/payment/received', '/verify', '/verify/:number/:code', '/donate/thanks', '/donate/cancelled', '/donate/qr'])
// Screens are split into their own chunks: each route carries a lazy loader instead of an element (redirects keep an element).
// Snapshot taken before any test runs: React Router clears `lazy` on a route object once it has loaded.
// Every screen sits under one pathless layout route (the persistent shell: bottom bar, skip link, route announcer).
const table = router.routes.flatMap((r) => r.children ?? []).filter((r) => r.path !== '*') // the 404 catch-all is not a screen
const initialRoutes = table.map((r) => ({ path: r.path as string, lazy: r.lazy, element: r.element }))
const screenRoutes = initialRoutes.filter((r) => r.lazy)

describe('router auth pages', () => {
  it.each(['/reset-password?token=t&email=a@b.c', '/verify-email'])('%s sits in the brand split on a desktop and not on a phone', async (path) => {
    const { unmount } = renderAt(path, 1280)
    expect(await screen.findByRole('complementary', { name: 'About SakramentoHub' })).toBeInTheDocument()
    unmount()
    renderAt(path, 390)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('complementary', { name: 'About SakramentoHub' })).not.toBeInTheDocument()
  })
})

describe('router desktop pages', () => {
  it('/settings/profile shows the Settings sub-menu on a desktop and not on a phone', async () => {
    const wide = renderAt('/settings/profile', 1280)
    expect(await screen.findByRole('navigation', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Settings content' })).toBeInTheDocument()
    wide.unmount()

    const phone = renderAt('/settings/profile', 390)
    expect(await screen.findByRole('link', { name: 'My bookings' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Settings content' })).not.toBeInTheDocument()
    phone.unmount()
  })

  it('/ opens the sign-in page on a desktop and the welcome slides on a phone', async () => {
    const wide = renderAt('/', 1280, false)
    expect(await screen.findByRole('complementary', { name: 'About SakramentoHub' })).toBeInTheDocument()
    expect(wide.memory.state.location.pathname).toBe('/login')
    expect(screen.queryByText('Welcome to SakramentoHub')).not.toBeInTheDocument()
    wide.unmount()

    const phone = renderAt('/', 390, false)
    expect(await screen.findByText('Welcome to SakramentoHub')).toBeInTheDocument()
    expect(phone.memory.state.location.pathname).toBe('/')
  })

  it('/login sits in the brand split on a desktop and not on a phone', async () => {
    const wide = renderAt('/login', 1280, false)
    expect(await screen.findByRole('complementary', { name: 'About SakramentoHub' })).toBeInTheDocument()
    wide.unmount()

    renderAt('/login', 390, false)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('complementary', { name: 'About SakramentoHub' })).not.toBeInTheDocument()
  })
})

describe('router', () => {
  it('wraps every route in the one persistent shell layout, which has no path and no lazy loader of its own', () => {
    expect(router.routes).toHaveLength(1)
    const [layout] = router.routes
    expect(layout.path).toBeUndefined()
    expect(layout.lazy).toBeUndefined()
    expect(layout.element).toBeDefined()
    expect(table.length).toBeGreaterThan(30)
  })

  it('has no remaining /booking/:sacrament/* fallback route', () => {
    const paths = table.map((r) => r.path)
    expect(paths).not.toContain('/booking/:sacrament/*')
  })

  it('loads every screen through a lazy chunk, and only the two redirects keep an element', () => {
    expect(screenRoutes.length).toBe(initialRoutes.length - 2)
    for (const route of initialRoutes) {
      if (route.lazy) {
        expect(typeof route.lazy, route.path).toBe('function')
        expect(route.element, `${route.path} must not import its screen eagerly`).toBeUndefined()
      } else {
        expect(['/booking', '/booking/:sacrament'], 'only redirects are eager').toContain(route.path)
      }
    }
  })

  it('registers a wizard route for every sacrament', () => {
    const paths = table.map((r) => r.path)
    // Every sacrament is served by the generic definition-driven wizard: none has its own routes.
    for (const slug of ['house-blessing', 'funeral', 'anointing', 'confirmation', 'baptism', 'wedding']) {
      expect(paths.filter((p) => p?.startsWith(`/booking/${slug}`)), slug).toEqual([])
    }
    expect(paths).toContain('/booking/:sacrament/:step')
  })

  it('registers routes for Settings, Help & About', () => {
    const paths = table.map((r) => r.path)
    for (const path of [
      '/settings',
      '/settings/profile',
      '/settings/notifications',
      '/settings/change-password',
      '/settings/delete-account',
      '/notifications',
      '/about',
      '/help',
    ]) {
      expect(paths).toContain(path)
    }
  })

  it('shows the Settings screen on /settings to a signed-in user, behind the sign-in guard', async () => {
    const view = renderAt('/settings', 390)
    expect(await screen.findByRole('link', { name: 'My bookings' })).toBeInTheDocument()
    expect(view.memory.state.location.pathname).toBe('/settings')
  })

  // Whether a fee is due is decided server-side at submit (from the
  // services table, which staff can reprice), not by which sacrament this
  // is — so every sacrament has a payment route, and the wizard only sends
  // the parishioner there when the backend says payment is due.
  it('registers a payment route for every sacrament, plus the PayMongo return routes', () => {
    const paths = table.map((r) => r.path)
    // Every sacrament pays through the generic route.
    expect(paths).toContain('/booking/:sacrament/payment')
    expect(paths).toContain('/payment/success')
    expect(paths).toContain('/payment/cancelled')
    expect(paths).toContain('/payment/simulated')
  })

  it('sends a signed-out visitor to /login from every route that requires auth, and leaves public routes alone', async () => {
    // /privacy is deliberately public too: the registration wizard links to it before the user has an account.
    for (const route of screenRoutes) {
      const path = concrete(route.path as string)
      const view = renderAt(path, 390, false)
      if (publicPaths.has(route.path as string)) {
        await vi.waitFor(() => expect(view.memory.state.initialized, path).toBe(true), { timeout: 20_000 })
        await new Promise((r) => setTimeout(r, 0))
        expect(view.memory.state.location.pathname, `${route.path} should be public`).toBe(path)
        // The public screen itself renders (a guarded route would show the sign-in screen or nothing).
        expect((await screen.findAllByRole('heading', undefined, { timeout: 20_000 })).length, path).toBeGreaterThan(0)
      } else {
        await vi.waitFor(() => expect(view.memory.state.location.pathname, `${route.path} should be guarded`).toBe('/login'), { timeout: 20_000 })
      }
      view.unmount()
    }
  }, 60_000)

  it('renders the real screen behind each guarded route for a signed-in user', async () => {
    const cases = [
      ['/settings', /^Account$/],
      ['/booking/baptism/1', /baptism/i],
      ['/services/baptism', /baptism/i],
    ] as const
    for (const [path, name] of cases) {
      const view = renderAt(path, 390)
      expect(await screen.findByRole('heading', { name }, { timeout: 20_000 }), path).toBeInTheDocument()
      expect(view.memory.state.location.pathname).toBe(path)
      view.unmount()
    }
  }, 60_000)

  it('gives every lazy route the reload error page for a chunk that fails to load', () => {
    expect(table.filter((r) => r.element === undefined).every((r) => r.errorElement !== undefined)).toBe(true)
  })

  it('registers the wallet, the certificate request form and the service page behind the sign-in guard', async () => {
    for (const path of ['/wallet', '/certificates/request', '/services', '/services/baptism']) {
      const view = renderAt(path, 390, false)
      await vi.waitFor(() => expect(view.memory.state.location.pathname, path).toBe('/login'), { timeout: 20_000 })
      view.unmount()
    }
  }, 30_000)

  it('registers the office desk behind the login and staff guards, and a public payment page', async () => {
    const paths = table.map((r) => r.path)
    for (const path of ['/desk', '/desk/result/:id', '/desk/booking/:id', '/desk/:sacrament/:step', '/payment/received']) {
      expect(paths).toContain(path)
    }
    // The fixed /desk/result and /desk/booking paths come before the wizard route, which also matches two segments.
    expect(paths.indexOf('/desk/result/:id')).toBeLessThan(paths.indexOf('/desk/:sacrament/:step'))
    expect(paths.indexOf('/desk/booking/:id')).toBeLessThan(paths.indexOf('/desk/:sacrament/:step'))

    // Signed out: the login guard. Signed in as a parishioner: the staff guard (home, or the demo-mode notice).
    for (const path of ['/desk', '/desk/result/1', '/desk/booking/1', '/desk/baptism/1']) {
      const out = renderAt(path, 390, false)
      await vi.waitFor(() => expect(out.memory.state.location.pathname, path).toBe('/login'), { timeout: 20_000 })
      out.unmount()
      const inside = renderAt(path, 390, true)
      await vi.waitFor(() => {
        const refused = inside.memory.state.location.pathname === '/home' || screen.queryByText('The office desk is not available in demo mode.')
        expect(refused, path).toBeTruthy()
      }, { timeout: 20_000 })
      inside.unmount()
    }

    // PayMongo sends a walk-in payer here; they may have no account, so it must not be behind the sign-in guard.
    const received = renderAt('/payment/received', 390, false)
    expect(await received.findByRole('heading', { name: 'Thank you' })).toBeInTheDocument()
    expect(received.memory.state.location.pathname).toBe('/payment/received')
    received.unmount()
  }, 60_000)

  it('serves /home and /calendar as the desktop pages on a wide screen and the phone screens on a phone', async () => {
    // Marker that only the desktop page has (the phone screens also sit in the website frame on a wide screen via AppShell).
    const marker = { '/home': () => document.querySelector('main.max-w-5xl'), '/calendar': () => screen.queryByRole('button', { name: 'Parish events' }) }
    for (const path of ['/home', '/calendar'] as const) {
      const wide = renderAt(path, 1280)
      expect(await screen.findByRole('navigation', { name: 'Main' }), path).toBeInTheDocument()
      // The one Main navigation is the desktop top bar, inside the banner.
      expect(within(screen.getByRole('banner')).getByRole('navigation', { name: 'Main' }), path).toBeInTheDocument()
      expect(await vi.waitFor(() => { const el = marker[path](); if (!el) throw new Error('desktop page missing'); return el }), path).toBeInTheDocument()
      wide.unmount()

      const phone = renderAt(path, 390)
      expect(await screen.findByRole('link', { name: 'My bookings' }), path).toBeInTheDocument()
      // The phone's floating bottom bar is the one "Main" navigation.
      expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'My bookings' }), path).toBeInTheDocument()
      expect(marker[path]()).not.toBeInTheDocument()
      phone.unmount()
    }
  })
  it('serves /services and /services/:id as the desktop pages on a wide screen and the phone screens on a phone', async () => {
    const marker = {
      // Both lists are the same; the desktop page is the one drawn in the 3xl website column.
      '/services': () => document.querySelector('main.max-w-3xl'),
      '/services/baptism': () => screen.queryByRole('complementary', { name: 'Book this service' }),
    }
    for (const path of ['/services', '/services/baptism'] as const) {
      const wide = renderAt(path, 1280)
      expect(await screen.findByRole('navigation', { name: 'Main' }), path).toBeInTheDocument()
      expect(await vi.waitFor(() => { const el = marker[path](); if (!el) throw new Error('desktop page missing'); return el }), path).toBeInTheDocument()
      wide.unmount()

      const phone = renderAt(path, 390)
      if (path === '/services') {
        expect(await screen.findByRole('link', { name: 'My bookings' }), path).toBeInTheDocument()
        // The phone's floating bottom bar is the one "Main" navigation.
        expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'My bookings' }), path).toBeInTheDocument()
      } else {
        // The phone service page has no tab bar (its footer is Start booking), loading or loaded.
        expect(await screen.findByRole('button', { name: 'Start booking' }), path).toBeInTheDocument()
        expect(screen.queryByRole('navigation', { name: 'Main' }), path).not.toBeInTheDocument()
      }
      expect(marker[path]()).not.toBeInTheDocument()
      phone.unmount()
    }
  }, 60_000)
  it('serves /booking/history as the list with a detail pane on a wide screen and the phone list on a phone', async () => {
    const wide = renderAt('/booking/history', 1280)
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Booking details' })).toBeInTheDocument()
    wide.unmount()

    const phone = renderAt('/booking/history', 390)
    expect(await screen.findByRole('link', { name: 'My bookings' })).toBeInTheDocument()
    expect(await screen.findByText('WEDD-1')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Booking details' })).not.toBeInTheDocument()
    phone.unmount()
  })
})
