import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { LoginScreen } from './LoginScreen'
import * as authData from '../../lib/data/auth'
import { ApiError } from '../../lib/api/client'
import { expectNoA11yViolations } from '../../test/a11y'

function renderWithProviders(initialEntries?: { pathname: string; state?: unknown }[]) {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries ?? ['/login']}>
        <LoginScreen />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('LoginScreen', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('pre-fills email when remember-me was saved', () => {
    localStorage.setItem('sakramentohub_remember_email', 'test@example.com')
    renderWithProviders()
    expect(screen.getByLabelText(/email/i)).toHaveValue('test@example.com')
  })

  it('offers Create an account as a link to /register, not a second filled button', () => {
    renderWithProviders()
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
    expect(screen.queryByText('OR')).not.toBeInTheDocument()
  })

  it('shows an account-deleted confirmation when redirected from account deletion', () => {
    renderWithProviders([{ pathname: '/login', state: { accountDeleted: true } }])
    expect(screen.getByRole('status')).toHaveTextContent('Your account has been deleted.')
  })

  it('does not show the account-deleted confirmation on a normal visit', () => {
    renderWithProviders()
    expect(screen.queryByText('Your account has been deleted.')).not.toBeInTheDocument()
  })

  it('has a Forgot password? text link to /forgot-password', () => {
    renderWithProviders()
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
  })

  it('uses the right input types, autocomplete values and keyboards', () => {
    renderWithProviders()
    const email = screen.getByLabelText(/email/i)
    expect(email).toHaveAttribute('type', 'email')
    expect(email).toHaveAttribute('autocomplete', 'email')
    expect(email).toHaveAttribute('inputmode', 'email')
    const password = screen.getByLabelText(/^password/i)
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
  })

  it('states Required in words and has a single filled primary button (navy, white text)', () => {
    renderWithProviders()
    expect(screen.getAllByText('Required')).toHaveLength(2)
    const primary = screen.getByRole('button', { name: 'Sign in' })
    expect(primary).toHaveAttribute('data-variant', 'default')
    expect(primary).toHaveClass('bg-navy', 'text-white')
  })

  it('shows and hides the password with a named control', () => {
    renderWithProviders()
    const password = screen.getByLabelText(/^password/i)
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('links the validation error to the field, marks it invalid, and focuses the first invalid field', async () => {
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bad' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const message = await screen.findByText('Enter a valid email address')
    const email = screen.getByLabelText(/email/i)
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email.getAttribute('aria-describedby')).toContain(message.id)
    await waitFor(() => expect(email).toHaveFocus())
    expect(email).toHaveValue('bad')
  })

  it('puts a server refusal on its field and in an alert summary, and keeps what was typed', async () => {
    vi.spyOn(authData, 'login').mockRejectedValue(
      new ApiError('These credentials do not match our records.', 422, { email: ['These credentials do not match our records.'] }),
    )
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('These credentials do not match our records.')
    const email = screen.getByLabelText(/email/i)
    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'))
    expect(email).toHaveValue('a@b.com')
    expect(screen.getByLabelText(/^password/i)).toHaveValue('password123')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('shows a spinner inside the disabled button while pending, with no separate text line', async () => {
    vi.spyOn(authData, 'login').mockReturnValue(new Promise(() => {}))
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Signing in' })).toBeDisabled())
    expect(screen.queryByText(/signing you in/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/waking up the server/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations, idle and with errors showing', async () => {
    const { container } = renderWithProviders()
    await expectNoA11yViolations(container)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText('Enter a valid email address')
    await expectNoA11yViolations(container)
  })

  it('shows a validation error for an invalid email', async () => {
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bad' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByText('Sign in'))
    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    })
  })

  describe('with VITE_MOCK_FAILURE_RATE forced to 1', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('shows an error message when the mock login rejects', async () => {
      vi.stubEnv('VITE_MOCK_FAILURE_RATE', '1')
      renderWithProviders()
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
      fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } })
      fireEvent.click(screen.getByText('Sign in'))
      await waitFor(() => {
        expect(screen.getByText('Failed to log in')).toBeInTheDocument()
      })
    })
  })
  it.each([
    ['staff', 'Desk page'],
    ['admin', 'Desk page'],
    ['parishioner', 'Home page'],
  ] as const)('after sign-in a %s account lands on %s', async (role, landing) => {
    vi.spyOn(authData, 'login').mockResolvedValue({ id: 'u1', fullName: 'Someone', email: 'someone@example.com', phone: '', address: '', role })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/desk" element={<p>Desk page</p>} />
            <Route path="/home" element={<p>Home page</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'someone@example.com' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByText('Sign in'))
    expect(await screen.findByText(landing)).toBeInTheDocument()
  })
})
