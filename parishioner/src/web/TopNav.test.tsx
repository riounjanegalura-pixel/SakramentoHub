import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TopNav } from './TopNav'
import { useAuthStore } from '../stores/auth-store'

vi.mock('../lib/data/notifications', () => ({ fetchNotifications: vi.fn(async () => []) }))

function renderNav(route = '/home') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <TopNav />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const user = { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '09170000000', address: '', emailVerifiedAt: '2026-01-01' }

describe('TopNav', () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false)
    Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {})
    Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {})
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})
    useAuthStore.setState({ user: user as never })
  })
  afterEach(() => useAuthStore.setState({ user: null }))

  it('is the banner landmark with a Main navigation of the four phone destinations', () => {
    renderNav('/home')
    const banner = screen.getByRole('banner')
    const nav = within(banner).getByRole('navigation', { name: 'Main' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Home', '/home'],
      ['Book', '/services'],
      ['My bookings', '/booking/history'],
      ['Account', '/settings'],
    ])
  })

  it('marks only the current link with aria-current and a non-colour cue', () => {
    renderNav('/services')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const current = within(nav).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current.map((a) => a.textContent)).toEqual(['Book'])
    expect(current[0]).toHaveClass('font-semibold', 'shadow-[inset_0_-3px_0_var(--navy)]')
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveClass('font-semibold')
  })

  it('is solid paper with a hairline border: no glass, no blur, no white text', () => {
    renderNav()
    const banner = screen.getByRole('banner')
    expect(banner).toHaveClass('bg-paper', 'border-b', 'border-line', 'text-navy')
    expect(banner.className).not.toMatch(/glass|backdrop|text-white/)
  })

  it('has controls at least 32 px tall and the navy focus ring', () => {
    renderNav()
    const link = screen.getByRole('link', { name: 'Home' })
    expect(link).toHaveClass('min-h-10')
    expect(link.className).toContain('focus-visible:outline-focus')
  })

  it('shows a Sign in link when signed out, with no nav or account menu', () => {
    useAuthStore.setState({ user: null })
    renderNav('/privacy')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('signed in, the account menu button carries the user name and opens a menu with Sign out', async () => {
    renderNav()
    await userEvent.click(screen.getByRole('button', { name: 'Rita Reyes' }))
    expect(await screen.findByRole('menuitem', { name: 'Documents' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })
})

describe('top bar contrast', () => {
  const css = readFileSync(join(import.meta.dirname, '../styles/globals.css'), 'utf8')
  const tok = (n: string) => new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6});`).exec(css)![1]
  const chan = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const lum = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(chan(a)), lum(chan(b))].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  it.each([['navy', 'paper'], ['ink-muted', 'paper']])('%s text on the %s bar is at least 4.5:1', (fg, bg) => {
    expect(ratio(tok(fg), tok(bg))).toBeGreaterThanOrEqual(4.5)
  })
})
