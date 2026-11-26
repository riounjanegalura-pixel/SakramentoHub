import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { ForgotPasswordScreen } from './ForgotPasswordScreen'
import { expectNoA11yViolations } from '../../test/a11y'

function renderWithProviders() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ForgotPasswordScreen />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ForgotPasswordScreen', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shows a validation error for an invalid email', async () => {
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bad' } })
    fireEvent.click(screen.getByText('Send Reset Link'))
    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    })
  })

  it('uses an email field with the right type, autocomplete and keyboard', () => {
    renderWithProviders()
    const email = screen.getByLabelText(/email/i)
    expect(email).toHaveAttribute('type', 'email')
    expect(email).toHaveAttribute('autocomplete', 'email')
    expect(email).toHaveAttribute('inputmode', 'email')
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toHaveClass('bg-gold', 'text-navy')
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
  })

  it('focuses the invalid email, links the error and keeps the input', async () => {
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bad' } })
    fireEvent.click(screen.getByText('Send Reset Link'))
    const message = await screen.findByText('Enter a valid email address')
    const email = screen.getByLabelText(/email/i)
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email.getAttribute('aria-describedby')).toContain(message.id)
    await waitFor(() => expect(email).toHaveFocus())
    expect(email).toHaveValue('bad')
  })

  it('has no accessibility violations in the form, error and success states', async () => {
    const { container } = renderWithProviders()
    await expectNoA11yViolations(container)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bad' } })
    fireEvent.click(screen.getByText('Send Reset Link'))
    await screen.findByText('Enter a valid email address')
    await expectNoA11yViolations(container)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'rio@example.com' } })
    fireEvent.click(screen.getByText('Send Reset Link'))
    expect(await screen.findByText(/reset link has been generated/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/reset link has been generated/i)
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
    await expectNoA11yViolations(container)
  })

  it('shows a generic success message that is honest about the log-based demo mechanism', async () => {
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'rio@example.com' } })
    fireEvent.click(screen.getByText('Send Reset Link'))
    await waitFor(() => {
      expect(screen.getByText(/reset link has been generated/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/written to the server log/i)).toBeInTheDocument()
  })

  it('shows an error message when the mock request rejects', async () => {
    vi.stubEnv('VITE_MOCK_FAILURE_RATE', '1')
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'rio@example.com' } })
    fireEvent.click(screen.getByText('Send Reset Link'))
    await waitFor(() => {
      expect(screen.getByText('Failed to request a password reset')).toBeInTheDocument()
    })
  })
})
