import type { ReactElement } from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { SettingsScreen } from './SettingsScreen'
import { useAuthStore } from '../../stores/auth-store'
import * as accountData from '../../lib/data/account'
import { expectNoA11yViolations } from '../../test/a11y'
import { expectTokenOnlySource } from '../../test/tokenSource'

function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient()
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: '1', fullName: 'Rio Galura', email: 'r@x.com', phone: '', address: '' } })
  })

  it('renders every menu item', () => {
    renderWithProviders(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    )
    expect(screen.getByText('Profile Info')).toBeInTheDocument()
    expect(screen.getByText('Notifications')).toBeInTheDocument()
    expect(screen.getByText('Change Password')).toBeInTheDocument()
    expect(screen.getByText('Documents and certificates')).toBeInTheDocument()
    expect(screen.getByText('About SakramentoHub')).toBeInTheDocument()
    expect(screen.getByText('Help / FAQs')).toBeInTheDocument()
    expect(screen.getByText('Export My Data')).toBeInTheDocument()
    expect(screen.getByText('Delete My Account')).toBeInTheDocument()
  })

  it('links Documents and certificates to /wallet; My bookings is a tab, not a second row here', () => {
    renderWithProviders(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    )
    expect(screen.getByText('Documents and certificates').closest('a')).toHaveAttribute('href', '/wallet')
    expect(within(screen.getByRole('main')).queryByRole('link', { name: /My bookings/ })).not.toBeInTheDocument()
  })

  it('links Delete My Account to /settings/delete-account', () => {
    renderWithProviders(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    )
    expect(screen.getByText('Delete My Account').closest('a')).toHaveAttribute(
      'href',
      '/settings/delete-account',
    )
  })

  it('logs out and clears the auth store on Sign out', async () => {
    renderWithProviders(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Sign out'))
    await waitFor(() => expect(useAuthStore.getState().user).toBeNull())
  })

  it('renders Profile Info as a link with chevron', () => {
    renderWithProviders(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    )
    const link = screen.getByText('Profile Info').closest('a')!
    expect(link).toHaveAttribute('href', '/settings/profile')
    expect(link.querySelector('.lucide-chevron-right')).toBeTruthy()
  })

  it('navigates to /settings/profile when Profile Info is clicked', () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/settings/profile" element={<div>Profile Screen Stub</div>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Profile Info'))
    expect(screen.getByText('Profile Screen Stub')).toBeInTheDocument()
  })

  it('triggers a real download of the exported data when Export My Data is clicked', async () => {
    const blob = new Blob(['{"profile":{}}'], { type: 'application/json' })
    vi.spyOn(accountData, 'exportMyData').mockResolvedValue(blob)
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    renderWithProviders(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Export My Data'))

    await waitFor(() => expect(createObjectURLSpy).toHaveBeenCalledWith(blob))
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
  })

  it('shows a real error when the export fails', async () => {
    vi.spyOn(accountData, 'exportMyData').mockRejectedValue(new Error('Failed to export your data'))

    renderWithProviders(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Export My Data'))

    await waitFor(() => {
      expect(screen.getByText('Failed to export your data')).toBeInTheDocument()
    })
  })

  describe('sections and structure', () => {
    function renderList(state?: unknown) {
      return renderWithProviders(
        <MemoryRouter initialEntries={[{ pathname: '/settings', state }]}>
          <SettingsScreen />
        </MemoryRouter>,
      )
    }

    it('uses design tokens only', () => {
      expectTokenOnlySource(import.meta.dirname, 'SettingsScreen.tsx')
    })

    it('groups the rows under real headings and ends with the delete-account section', () => {
      renderList()
      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
      expect(headings).toEqual(['Your profile', 'Records', 'About the app', 'Your data', 'Delete account'])
    })

    it('puts Delete My Account last, in the danger colour, after Sign out', () => {
      renderList()
      const del = screen.getByText('Delete My Account').closest('a') as HTMLElement
      expect(del.className).toMatch(/border-danger/)
      expect(screen.getByText('Delete My Account')).toHaveClass('text-danger')
      const logout = screen.getByRole('button', { name: 'Sign out' })
      expect(logout.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      const page = within(screen.getByRole('main'))
      const all = page.getAllByRole('link').concat(page.getAllByRole('button'))
      const last = all.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).pop()
      expect(last).toBe(del)
    })

    it('every row is a 44 px target', () => {
      renderList()
      for (const link of within(screen.getByRole('main')).getAllByRole('link')) expect(link.className).toMatch(/min-h-(11|16|\[44px\])/)
    })

    it('announces the password change as a status', () => {
      renderList({ passwordUpdated: true })
      expect(screen.getByRole('status')).toHaveTextContent('Password updated')
    })

    it('has no accessibility violations', async () => {
      const { container } = renderList()
      await expectNoA11yViolations(container)
    })
  })
})
