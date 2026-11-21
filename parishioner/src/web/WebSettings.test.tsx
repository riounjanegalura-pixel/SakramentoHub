import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { WebSettings } from './WebSettings'
import { WebAccountPane } from './WebAccountPane'
import { useAuthStore } from '../stores/auth-store'
import { setViewport } from '../test/viewport'
import { expectNoA11yViolations } from '../test/a11y'
import { expectTokenOnlySource } from '../test/tokenSource'

vi.mock('../lib/data/account', () => ({ exportMyData: vi.fn(async () => new Blob(['{}'])) }))

function renderAt(path: string, state?: unknown) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <Routes>
          <Route path="/settings" element={<WebSettings><WebAccountPane /></WebSettings>} />
          <Route path="/settings/profile" element={<WebSettings><p>Profile screen body</p></WebSettings>} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WebSettings', () => {
  beforeEach(() => {
    setViewport(1280)
    useAuthStore.setState({
      user: { id: 'u1', fullName: 'Ricardo Dalisay', email: 'r@example.com', phone: '', address: '', emailVerifiedAt: '2026-01-01' } as never,
      logout: vi.fn(async () => {}),
    })
  })

  it('lists the seven settings sections and marks the current one', () => {
    renderAt('/settings')
    const menu = screen.getByRole('navigation', { name: 'Settings' })
    expect(within(menu).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Account', 'Profile', 'Notifications', 'Change password', 'About', 'Help', 'Delete account',
    ])
    expect(within(menu).getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows the signed-in user and the account actions on the Account page', () => {
    renderAt('/settings')
    const page = within(screen.getByRole('main'))
    expect(page.getByText('Ricardo Dalisay')).toBeInTheDocument()
    expect(screen.getByText('r@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export my data' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('exports the data from the Account page', async () => {
    renderAt('/settings')
    await userEvent.click(screen.getByRole('button', { name: 'Export my data' }))
    const { exportMyData } = await import('../lib/data/account')
    expect(vi.mocked(exportMyData)).toHaveBeenCalled()
  })

  it('logs out and lands on the login page', async () => {
    renderAt('/settings')
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(useAuthStore.getState().logout).toHaveBeenCalled()
  })

  it('shows the password notice once when arriving after a change', () => {
    renderAt('/settings', { passwordUpdated: true })
    expect(screen.getByRole('status')).toHaveTextContent('Password updated')
  })

  it('keeps the sub-page screen inside the Settings pane without a second top bar', () => {
    renderAt('/settings/profile')
    expect(screen.getByText('Profile screen body')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Settings' })).toBeInTheDocument()
  })

  describe('sections and structure', () => {
    it('keeps the side menu and the Account pane on tokens only', () => {
      expectTokenOnlySource(import.meta.dirname, 'WebSettings.tsx')
      expectTokenOnlySource(import.meta.dirname, 'WebAccountPane.tsx')
    })

    it('gives the Account pane real section headings and ends with the delete-account section', () => {
      renderAt('/settings')
      const pane = within(screen.getByRole('region', { name: 'Settings content' }))
      expect(pane.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
        'Signed in as', 'Your data', 'Session', 'Delete account',
      ])
      const del = pane.getByRole('link', { name: 'Delete my account' })
      expect(del).toHaveAttribute('href', '/settings/delete-account')
      expect(del.className).toMatch(/text-danger/)
      const buttons = pane.getAllByRole('button').concat(pane.getAllByRole('link'))
      const last = buttons.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).pop()
      expect(last).toBe(del)
    })

    it('marks the current page with aria-current and sets the delete link apart', () => {
      renderAt('/settings')
      const menu = screen.getByRole('navigation', { name: 'Settings' })
      expect(within(menu).getByRole('link', { name: 'Delete account' })).toHaveClass('text-danger')
      for (const link of within(menu).getAllByRole('link')) expect(link.className).toMatch(/min-h-11/)
    })

    it('has no accessibility violations on the Account pane', async () => {
      const { container } = renderAt('/settings', { passwordUpdated: true })
      await expectNoA11yViolations(container, { fullPage: false })
    })
  })
})
