import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { LoginScreen } from './LoginScreen'
import { useAuthStore } from '../../stores/auth-store'
import * as authData from '../../lib/data/auth'
import { ApiError } from '../../lib/api/client'

function renderWithProviders() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/login']}>
        <LoginScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LoginScreen', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isBootstrapping: false })
    vi.restoreAllMocks()
  })

  it('has a Forgot password? entry point', () => {
    renderWithProviders()
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeInTheDocument()
  })

  it('logs a staff user in and stores them', async () => {
    vi.spyOn(authData, 'login').mockResolvedValue({
      id: '1',
      fullName: 'Staff One',
      email: 's@x.com',
      phone: '',
      address: '',
      role: 'staff',
      isActive: true,
    })

    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 's@x.com' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(useAuthStore.getState().user?.email).toBe('s@x.com')
    })
  })

  it('shows the API error message when login rejects', async () => {
    vi.spyOn(authData, 'login').mockRejectedValue(new Error('Invalid credentials'))

    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 's@x.com' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'wrongpass' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('rejects a successfully-authenticated parishioner instead of admitting them', async () => {
    vi.spyOn(authData, 'login').mockResolvedValue({
      id: '4',
      fullName: 'Rio',
      email: 'rio@x.com',
      phone: '',
      address: '',
      role: 'parishioner',
      isActive: true,
    })

    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'rio@x.com' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.getByText('This account does not have admin access.')).toBeInTheDocument()
    })
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('shows a spinner inside the disabled button while pending, with no notice text', async () => {
    vi.spyOn(authData, 'login').mockReturnValue(new Promise(() => {})) // never resolves
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 's@x.com' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Signing in' })).toBeDisabled())
    expect(screen.queryByText(/waking up the server/i)).not.toBeInTheDocument()
  })

  it('words a refused sign-in as an instruction', async () => {
    vi.spyOn(authData, 'login').mockRejectedValue(new ApiError('Invalid credentials', 401, null))
    renderWithProviders()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 's@x.com' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'wrongpass' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('That email or password is not right. Check both and try again.')).toBeInTheDocument()
  })

  it('marks both fields Required in words and shows the session-ended notice', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { error: 'Your session ended. Sign in again to continue.' } }]}>
          <LoginScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getAllByText('Required')).toHaveLength(2)
    expect(screen.getByRole('alert')).toHaveTextContent('Your session ended. Sign in again to continue.')
  })
})
