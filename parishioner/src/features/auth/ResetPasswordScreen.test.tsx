import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { ResetPasswordScreen } from './ResetPasswordScreen'
import { expectNoA11yViolations } from '../../test/a11y'

function renderAt(path: string) {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordScreen />} />
          <Route path="/login" element={<div>Login Screen</div>} />
          <Route path="/forgot-password" element={<div>Forgot Password Screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ResetPasswordScreen', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shows an error and a request-new-link button when token/email are missing', () => {
    renderAt('/reset-password')
    expect(screen.getByText(/missing its token or email/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Request a New Link'))
    expect(screen.getByText('Forgot Password Screen')).toBeInTheDocument()
  })

  it('uses new-password autocomplete, a named show/hide control, and a gold primary button', () => {
    renderAt('/reset-password?token=abc&email=rio@example.com')
    const password = screen.getByLabelText(/new password/i)
    const confirm = screen.getByLabelText(/confirm password/i)
    expect(password).toHaveAttribute('autocomplete', 'new-password')
    expect(confirm).toHaveAttribute('autocomplete', 'new-password')
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(confirm).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Reset Password' })).toHaveClass('bg-gold', 'text-navy')
  })

  it('focuses the first invalid field, links its error and keeps the input', async () => {
    renderAt('/reset-password?token=abc&email=rio@example.com')
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }))
    const message = await screen.findByText('Password must be at least 8 characters')
    const password = screen.getByLabelText(/new password/i)
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password.getAttribute('aria-describedby')).toContain(message.id)
    await waitFor(() => expect(password).toHaveFocus())
    expect(password).toHaveValue('short')
  })

  it('has no accessibility violations: missing link, form, and error states', async () => {
    const missing = renderAt('/reset-password')
    await expectNoA11yViolations(missing.container)
    missing.unmount()
    const { container } = renderAt('/reset-password?token=abc&email=rio@example.com')
    await expectNoA11yViolations(container)
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }))
    await screen.findByText('Password must be at least 8 characters')
    await expectNoA11yViolations(container)
  })

  it('shows the masked email the link applies to', () => {
    renderAt('/reset-password?token=abc&email=rio@example.com')
    expect(screen.getByText('r***@example.com')).toBeInTheDocument()
  })

  it('shows a validation error for a mismatched confirmation', async () => {
    renderAt('/reset-password?token=abc&email=rio@example.com')
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }))
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    })
  })

  it('resets the password and redirects to login on success', async () => {
    renderAt('/reset-password?token=abc&email=rio@example.com')
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }))
    await waitFor(() => {
      expect(screen.getByText('Login Screen')).toBeInTheDocument()
    })
  })

  it('shows an error message when the mock reset rejects', async () => {
    vi.stubEnv('VITE_MOCK_FAILURE_RATE', '1')
    renderAt('/reset-password?token=abc&email=rio@example.com')
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }))
    await waitFor(() => {
      expect(screen.getByText('Failed to reset password')).toBeInTheDocument()
    })
  })
})
