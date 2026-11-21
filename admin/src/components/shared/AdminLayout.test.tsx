import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expectNoA11yViolations } from '../../test/a11y'
import { AdminLayout } from './AdminLayout'
import * as notificationsData from '../../lib/data/notifications'
import { useAuthStore } from '../../stores/auth-store'
import { renderWithProviders } from '../../test/render'
import type { Role } from '../../lib/types'

const user = (role: Role) => ({ id: 'u1', fullName: 'Staff One', email: 's@example.com', phone: '', address: '', role, isActive: true })

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.spyOn(notificationsData, 'fetchNotifications').mockResolvedValue([])
  })
  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ user: null })
  })

  const STAFF_LABELS = ['Dashboard', 'Bookings', 'Register', 'Certificate requests', 'Parish events', 'Reports', 'Settings', 'Audit log']

  it('lists the destinations in groups, Dashboard first', () => {
    useAuthStore.setState({ user: user('staff') })
    renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(STAFF_LABELS)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByRole('link', { name: 'Schedule' })).not.toBeInTheDocument()
    for (const g of ['Dashboard', 'Records', 'Parish', 'Administration']) {
      expect(within(nav).getByRole('group', { name: g })).toBeInTheDocument()
    }
  })

  it('adds Users for an admin only, inside Administration', () => {
    useAuthStore.setState({ user: user('admin') })
    renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>)
    const admin = within(screen.getByRole('group', { name: 'Administration' }))
    expect(admin.getAllByRole('link').map((a) => a.textContent)).toEqual(['Settings', 'Audit log', 'Users'])
  })

  it('shows no Users to a staff member', () => {
    useAuthStore.setState({ user: user('staff') })
    renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>)
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  it('has no Check-in entry: arrival is marked on the booking itself', () => {
    useAuthStore.setState({ user: user('admin') })
    renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>)
    expect(screen.queryByRole('link', { name: 'Check-in' })).not.toBeInTheDocument()
  })

  it('hides the sidebar and header when printing', () => {
    useAuthStore.setState({ user: user('staff') })
    const { container } = renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>)
    expect(container.querySelector('aside')).toHaveClass('print:hidden')
    expect(container.querySelector('header')).toHaveClass('print:hidden')
  })

  it('shows the bell in the header', () => {
    useAuthStore.setState({ user: user('admin') })
    const { container } = renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>)
    expect(within(container.querySelector('header') as HTMLElement).getByRole('button', { name: /^Notifications/ })).toBeInTheDocument()
  })

  describe('New walk-in booking', () => {
    it.each<Role>(['staff', 'admin'])('opens the walk-in screen inside this app for %s', (role) => {
      useAuthStore.setState({ user: user(role) })
      renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>)
      const link = screen.getByRole('link', { name: 'New walk-in booking' })
      expect(link).toHaveAttribute('href', '/walk-in')
      expect(link).not.toHaveAttribute('target')
      expect(link.className).toContain('min-h-11')
    })

    it('is hidden from a parishioner account', () => {
      useAuthStore.setState({ user: user('parishioner') })
      renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>)
      expect(screen.queryByRole('link', { name: 'New walk-in booking' })).not.toBeInTheDocument()
    })

    describe('on a phone', () => {
      const original = window.matchMedia
      beforeEach(() => {
        window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
      })
      afterEach(() => {
        window.matchMedia = original
      })

      it('is in the More sheet with the same destination and tap size', async () => {
        useAuthStore.setState({ user: user('staff') })
        renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>)
        await userEvent.click(screen.getByRole('button', { name: 'More' }))
        const sheet = await screen.findByRole('navigation', { name: 'All pages' })
        const link = within(sheet).getByRole('link', { name: 'New walk-in booking' })
        expect(link).toHaveAttribute('href', '/walk-in')
        expect(link.className).toContain('min-h-11')
      })

      it('is not in the More sheet for a parishioner account', async () => {
        useAuthStore.setState({ user: user('parishioner') })
        renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>)
        await userEvent.click(screen.getByRole('button', { name: 'More' }))
        await screen.findByRole('navigation', { name: 'All pages' })
        expect(screen.queryByRole('link', { name: 'New walk-in booking' })).not.toBeInTheDocument()
      })
    })
  })

  it('has no accessibility violations as a whole page', async () => {
    useAuthStore.setState({ user: user('admin') })
    const { container } = renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>, { route: '/bookings' })
    await expectNoA11yViolations(container, { fullPage: true })
  })

  it('marks only the active destination with aria-current and a plain 3 px rule, no sliding pill', () => {
    useAuthStore.setState({ user: user('staff') })
    renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>, { route: '/bookings/abc' })
    const current = screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Bookings')
    const indicators = screen.getAllByTestId('nav-active')
    expect(indicators).toHaveLength(1)
    expect(indicators[0]).not.toHaveAttribute('data-layout-id')
    expect(current[0]).toContainElement(indicators[0])
  })

  it('has the skip link first in the tab order, targeting the focusable main', async () => {
    const u = userEvent.setup()
    useAuthStore.setState({ user: user('staff') })
    renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>)
    await u.tab()
    const skip = screen.getByRole('link', { name: 'Skip to main content' })
    expect(skip).toHaveFocus()
    expect(skip).toHaveAttribute('href', '#main')
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('id', 'main')
    expect(main).toHaveAttribute('tabindex', '-1')
  })

  it('uses a navy sidebar, a solid top bar, and a labelled landmark structure', () => {
    useAuthStore.setState({ user: user('staff') })
    const { container } = renderWithProviders(<AdminLayout title="My page"><p>content</p></AdminLayout>)
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside).toHaveClass('bg-navy')
    expect(aside.className).not.toMatch(/glass|backdrop/)
    const header = container.querySelector('header') as HTMLElement
    expect(header).not.toHaveClass('bg-glass')
    expect(header).toHaveClass('bg-paper')
    expect(screen.getByRole('banner')).toBe(header)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My page')
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('gives every destination 44 px of height on touch screens and 40 px on desktop', () => {
    useAuthStore.setState({ user: user('admin') })
    renderWithProviders(<AdminLayout title="Anything"><p>content</p></AdminLayout>)
    for (const a of within(screen.getByRole('navigation')).getAllByRole('link')) {
      expect(a).toHaveClass('min-h-11')
      expect(a).toHaveClass('lg:min-h-10')
    }
  })
})
