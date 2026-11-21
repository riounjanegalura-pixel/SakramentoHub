import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { setViewport } from '../../test/viewport'
import { useAuthStore as useAuthStoreForFrame } from '../../stores/auth-store'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ChangePasswordScreen } from './ChangePasswordScreen'
import { expectNoA11yViolations } from '../../test/a11y'
import { expectTokenOnlySource } from '../../test/tokenSource'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderWithProviders() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChangePasswordScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ChangePasswordScreen', () => {
  it('shows a mismatch error when confirm password differs', async () => {
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/^current password/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'newpassword456' } })
    fireEvent.change(screen.getByLabelText(/^confirm password/i), { target: { value: 'different789' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }))
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    })
  })

  it('navigates to /settings after a successful password change', async () => {
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/^current password/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'newpassword456' } })
    fireEvent.change(screen.getByLabelText(/^confirm password/i), { target: { value: 'newpassword456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }))
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/settings', { state: { passwordUpdated: true } })
    })
  })

  it('uses the right autocomplete values, password type and states Required in words', () => {
    renderWithProviders()
    expect(screen.getByLabelText(/^current password/i)).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText(/^new password/i)).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText(/^confirm password/i)).toHaveAttribute('autocomplete', 'new-password')
    for (const l of [/^current password/i, /^new password/i, /^confirm password/i]) {
      expect(screen.getByLabelText(l)).toHaveAttribute('type', 'password')
      expect(screen.getByLabelText(l).closest('[data-slot="field"]')).toHaveTextContent('Required')
    }
  })

  it('shows and hides the typed password with one control', () => {
    renderWithProviders()
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText(/^new password/i)).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
  })

  it('links errors to the fields, focuses the first invalid one and keeps the input', async () => {
    renderWithProviders()
    const current = screen.getByLabelText(/^current password/i)
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'newpassword456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }))
    await waitFor(() => expect(current).toHaveAttribute('aria-invalid', 'true'))
    expect(current).toHaveFocus()
    expect(current.getAttribute('aria-describedby')).toMatch(/error/)
    expect(screen.getByLabelText(/^new password/i)).toHaveValue('newpassword456')
  })

  it('has one filled primary, a section heading, tokens only and no violations', async () => {
    const { container } = renderWithProviders()
    expect(screen.getByRole('heading', { level: 2, name: 'Password' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change Password' })).toHaveAttribute('data-slot', 'button')
    expectTokenOnlySource(import.meta.dirname, 'ChangePasswordScreen.tsx')
    await expectNoA11yViolations(container)
  })

  it('hides the bottom tab bar — a focused, sensitive single-task form', () => {
    renderWithProviders()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  describe('website frame', () => {
    const original = window.matchMedia
    afterEach(() => {
      window.matchMedia = original
    })

    it('sits inside the website frame on a desktop', async () => {
      setViewport(1280)
      useAuthStoreForFrame.setState({ user: { id: 'u1', fullName: 'Rita Reyes', email: 'r@example.org', phone: '', address: '' } as never })
      renderWithProviders()
      expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    })

    it('keeps the phone frame without a tab bar on a phone', () => {
      setViewport(390)
      renderWithProviders()
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    })
  })
})
