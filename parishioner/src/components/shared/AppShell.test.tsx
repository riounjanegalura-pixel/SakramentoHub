import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AppShell } from './AppShell'
import { setViewport } from '../../test/viewport'
import { useAuthStore } from '../../stores/auth-store'
import { WebPaneContext } from '../../web/WebPane'

vi.mock('../../lib/data/notifications', () => ({ fetchNotifications: vi.fn(async () => []) }))
vi.mock('../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter the Apostle Parish', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

const original = window.matchMedia
afterEach(() => {
  window.matchMedia = original
  useAuthStore.setState({ user: null })
})

function renderShell(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppShell', () => {
  it('inside a desktop Settings pane, shows the header card and content with no frame of its own', () => {
    setViewport(1280)
    renderShell(
      <WebPaneContext.Provider value>
        <AppShell header={<p>Profile header</p>} showBottomNav={false}>
          <p>pane content</p>
        </AppShell>
      </WebPaneContext.Provider>,
    )
    expect(screen.getByText('Profile header')).toBeInTheDocument()
    expect(screen.getByText('pane content')).toBeInTheDocument()
    expect(document.querySelector('[data-app-shell]')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    setViewport(390)
  })

  it('passes webWidth to the website frame content on a desktop', () => {
    setViewport(1280)
    renderShell(
      <AppShell webWidth="max-w-6xl">
        <p>content</p>
      </AppShell>,
    )
    expect(screen.getByText('content').closest('main')).toHaveClass('max-w-6xl')
    setViewport(390)
  })

  it('centers content in a max-width-480 column on wide viewports', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <p>content</p>
        </AppShell>
      </MemoryRouter>,
    )
    const wrapper = screen.getByText('content').closest('[data-app-shell]')
    expect(wrapper).toHaveClass('max-w-[480px]')
    expect(wrapper).toHaveClass('mx-auto')
  })

  it('on a phone keeps the 480px frame and the bottom tab bar', () => {
    setViewport(390)
    renderShell(
      <AppShell>
        <p>x</p>
      </AppShell>,
    )
    expect(document.querySelector('[data-app-shell]')).not.toBeNull()
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })

  it('on a desktop, a tab screen sits in the website frame with no bottom tab bar', async () => {
    setViewport(1280)
    useAuthStore.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '' } as never })
    renderShell(
      <AppShell header={<h1>Calendar</h1>}>
        <p>body</p>
      </AppShell>,
    )
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
    expect(document.querySelector('[data-app-shell]')).toBeNull()
    // The only Main navigation is the top bar's; the phone tab bar is not drawn.
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(1)
    expect(screen.getByRole('banner')).toContainElement(screen.getByRole('navigation', { name: 'Main' }))
  })

  it('on a desktop, a screen without the tab bar (sign-in, wizard) keeps the phone frame', () => {
    setViewport(1280)
    renderShell(
      <AppShell showBottomNav={false}>
        <p>body</p>
      </AppShell>,
    )
    expect(document.querySelector('[data-app-shell]')).not.toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  const signedIn = () => useAuthStore.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '' } as never })

  it('on a desktop, a screen with no tab bar can still opt into the website frame', async () => {
    setViewport(1280)
    signedIn()
    renderShell(
      <AppShell showBottomNav={false} webFrame header={<h1>Notifications</h1>}>
        <p>body</p>
      </AppShell>,
    )
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(document.querySelector('[data-app-shell]')).toBeNull()
  })

  it('on a phone, the same screen keeps the phone frame without the tab bar', () => {
    setViewport(390)
    signedIn()
    renderShell(
      <AppShell showBottomNav={false} webFrame header={<h1>Notifications</h1>}>
        <p>body</p>
      </AppShell>,
    )
    expect(document.querySelector('[data-app-shell]')).not.toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('a screen that does not opt in keeps the phone frame on a desktop', () => {
    setViewport(1280)
    renderShell(
      <AppShell showBottomNav={false}>
        <p>body</p>
      </AppShell>,
    )
    expect(document.querySelector('[data-app-shell]')).not.toBeNull()
  })

  it('inside a pane context on a phone, renders the phone shell unchanged', () => {
    setViewport(390)
    renderShell(
      <WebPaneContext.Provider value>
        <AppShell header={<p>Profile header</p>}>
          <p>pane content</p>
        </AppShell>
      </WebPaneContext.Provider>,
    )
    expect(document.querySelector('[data-app-shell]')).not.toBeNull()
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByText('Profile header')).toBeInTheDocument()
  })

  it('pads the content so nothing hides behind the floating bar', () => {
    setViewport(390)
    renderShell(
      <AppShell>
        <p>body</p>
      </AppShell>,
    )
    const main = screen.getByText('body').closest('main')!
    expect(main.className).toContain('pb-[var(--chrome-bottom)]')
  })

  it('marks the phone chrome it draws, so the scroll padding applies only there', () => {
    setViewport(390)
    const { unmount } = renderShell(
      <AppShell header={<p>head</p>}>
        <p>body</p>
      </AppShell>,
    )
    expect(document.querySelector('[data-app-shell]')!.getAttribute('data-chrome')!.split(' ').sort()).toEqual(['bottom', 'top'])
    unmount()
    renderShell(
      <AppShell showBottomNav={false}>
        <p>body</p>
      </AppShell>,
    )
    expect(document.querySelector('[data-app-shell]')).not.toHaveAttribute('data-chrome')
  })

  it('a desktop website frame carries no phone chrome marker', () => {
    setViewport(1280)
    renderShell(
      <AppShell header={<p>head</p>}>
        <p>body</p>
      </AppShell>,
    )
    expect(document.querySelector('[data-chrome]')).toBeNull()
    setViewport(390)
  })

  it('the phone content region is the skip-link target', () => {
    setViewport(390)
    renderShell(
      <AppShell>
        <p>body</p>
      </AppShell>,
    )
    const main = screen.getByText('body').closest('main')!
    expect(main).toHaveAttribute('id', 'main')
    expect(main).toHaveAttribute('tabindex', '-1')
  })

  it('adds no bottom padding when there is no tab bar', () => {
    setViewport(390)
    renderShell(
      <AppShell showBottomNav={false}>
        <p>body</p>
      </AppShell>,
    )
    expect(screen.getByText('body').closest('main')!.className).not.toContain('pb-')
  })
})
