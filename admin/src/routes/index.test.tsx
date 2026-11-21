import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import { router } from './index'
import { useAuthStore } from '../stores/auth-store'

// Screens are split into their own chunks: each route carries a lazy loader instead of an element (the redirect keeps an element).
// Snapshot taken before any test runs: React Router clears `lazy` on a route object once it has loaded.
const flat = (rs: typeof router.routes): typeof router.routes => rs.flatMap((r) => (r.children ? flat(r.children as typeof router.routes) : [r]))
const initialRoutes = flat(router.routes).map((r) => ({ path: r.path as string, lazy: r.lazy, element: r.element }))
const screenRoutes = initialRoutes.filter((r) => r.lazy)
// Each public screen's own heading: if a public route were guarded this would not render for a signed-out visitor.
const publicHeadings: Record<string, string> = { '/login': 'Sign in', '/forgot-password': 'Forgot your password?', '/reset-password': "This link can't be used" }
const publicPaths = new Set(['/', ...Object.keys(publicHeadings)])

const staff = { id: '1', fullName: 'Staff One', email: 's@x.com', phone: '', address: '', role: 'staff', isActive: true }

afterEach(() => {
  useAuthStore.setState({ user: null, isBootstrapping: false })
})

function concrete(path: string) {
  return path.replace(':reference', 'REF-1').replace(':id', '1')
}

function renderAt(path: string, user: unknown = null) {
  useAuthStore.setState({ user: user as never, isBootstrapping: false })
  const memory = createMemoryRouter(router.routes, { initialEntries: [path] })
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={memory} />
    </QueryClientProvider>,
  )
  return Object.assign(view, { memory })
}

describe('admin routes', () => {
  it('loads every screen through a lazy chunk, and only the bare address keeps an element', () => {
    expect(initialRoutes).toHaveLength(21)
    expect(screenRoutes).toHaveLength(18)
    for (const route of initialRoutes) {
      if (route.lazy) {
        expect(typeof route.lazy, route.path).toBe('function')
        expect(route.element, `${route.path} must not import its screen eagerly`).toBeUndefined()
      } else {
        expect(['/', '/schedule', '*']).toContain(route.path)
      }
    }
  })

  it('shows the sign-in screen after its chunk loads', async () => {
    renderAt('/login')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('sends the bare address to the Dashboard', async () => {
    // The Dashboard's chunk loads before the navigation commits. Warm it first: its first transform can take
    // well over 20 s when the whole suite runs in parallel, and that cost is not what this test is about.
    await import('../features/dashboard/DashboardScreen')
    const view = renderAt('/', staff)
    await vi.waitFor(() => expect(view.memory.state.location.pathname).toBe('/dashboard'), { timeout: 20_000 })
  }, 90_000)

  it('sends an old /schedule link to the same day on the Dashboard', async () => {
    await import('../features/dashboard/DashboardScreen')
    const view = renderAt('/schedule?date=2026-11-05', staff)
    await vi.waitFor(() => expect(view.memory.state.location.pathname + view.memory.state.location.search).toBe('/dashboard?date=2026-11-05'), { timeout: 20_000 })
  }, 90_000)

  it('guards every staff route: a signed-out visitor goes to /login, and the public routes are left alone', async () => {
    for (const route of screenRoutes) {
      const path = concrete(route.path)
      const view = renderAt(path)
      if (publicPaths.has(route.path)) {
        await vi.waitFor(() => expect(view.memory.state.initialized, path).toBe(true), { timeout: 20_000 })
        await new Promise((r) => setTimeout(r, 0))
        expect(await screen.findByRole('heading', { name: publicHeadings[route.path] }, { timeout: 20_000 }), path).toBeInTheDocument()
        expect(view.memory.state.location.pathname, `${route.path} should be public`).toBe(path)
      } else {
        await vi.waitFor(() => expect(view.memory.state.location.pathname, `${route.path} should be guarded`).toBe('/login'), { timeout: 20_000 })
      }
      view.unmount()
    }
  }, 60_000)

  it('gives every lazy route the reload error page for a chunk that fails to load', () => {
    expect(screenRoutes.length).toBe(18)
    expect(router.routes.filter((r) => r.path !== '/' && r.path !== '/schedule' && r.path !== '*').every((r) => r.errorElement !== undefined)).toBe(true)
  })

  it('keeps a parishioner account out of the guarded /bookings and /certificate-requests routes', async () => {
    for (const path of ['/bookings', '/certificate-requests']) {
      const view = renderAt(path, { ...staff, role: 'parishioner' })
      await vi.waitFor(() => expect(view.memory.state.location.pathname, path).toBe('/login'), { timeout: 20_000 })
      view.unmount()
    }
  }, 30_000)
})
