import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { LoginScreen } from './LoginScreen'
import { ProtectedRoute } from '../../components/shared/ProtectedRoute'
import { useAuthStore } from '../../stores/auth-store'
import * as authData from '../../lib/data/auth'
import { LocationProbe } from '../../test/render'
import { safeReturnTarget } from '../../lib/returnTo'

const staff = { id: '1', fullName: 'Staff One', email: 's@x.com', phone: '', address: '', role: 'staff' as const, isActive: true }

function renderApp(initial: string | { pathname: string; state?: unknown }) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/check-in/:reference" element={<ProtectedRoute><div>Check-in page</div><LocationProbe /></ProtectedRoute>} />
          <Route path="/bookings" element={<ProtectedRoute><div>Bookings page</div><LocationProbe /></ProtectedRoute>} />
          <Route path="/schedule" element={<ProtectedRoute><div>Schedule page</div><LocationProbe /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><div>Dashboard page</div><LocationProbe /></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function signIn() {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 's@x.com' } })
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'password123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('return to the requested page after login', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isBootstrapping: false })
    vi.restoreAllMocks()
    vi.spyOn(authData, 'login').mockResolvedValue(staff)
  })

  it('a signed-out visit to /check-in/ABC-123 lands back there after login', async () => {
    renderApp('/check-in/ABC-123')
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    await signIn()
    expect(await screen.findByText('Check-in page')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/check-in/ABC-123')
  })

  it('keeps the query string', async () => {
    renderApp('/schedule?date=2026-11-03')
    await screen.findByRole('button', { name: 'Sign in' })
    await signIn()
    expect(await screen.findByText('Schedule page')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/schedule?date=2026-11-03')
  })

  it('goes to /dashboard when there is nowhere to return to', async () => {
    renderApp('/login')
    await signIn()
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument()
  })

  it.each([
    ['a protocol-relative address', '//evil.example/steal'],
    ['an absolute address', 'https://evil.example/'],
    ['a backslash address', '/\\evil.example'],
    ['the login page', '/login'],
    ['the login page with a query', '/login?x=1'],
    ['the forgot-password page', '/forgot-password'],
    ['the reset-password page', '/reset-password?token=abc'],
    ['a javascript address', 'javascript:alert(1)'],
  ])('ignores %s and goes to /dashboard', async (_name, from) => {
    renderApp({ pathname: '/login', state: { from } })
    await signIn()
    await waitFor(() => expect(screen.getByText('Dashboard page')).toBeInTheDocument())
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
  })
})

describe('safeReturnTarget', () => {
  it.each([
    ['/check-in/ABC-123', '/check-in/ABC-123'],
    ['/schedule?date=2026-11-03', '/schedule?date=2026-11-03'],
    ['/bookings/42', '/bookings/42'],
  ])('accepts %s', (input, expected) => expect(safeReturnTarget(input)).toBe(expected))

  it.each([
    [undefined], [null], [42], [''], ['bookings'], ['//evil.example'], ['/\\evil.example'], ['\\\\evil.example'], ['/\t/evil.example'],
    ['http://evil.example'], ['/http://evil.example'], ['/login'], ['/login/'], ['/login?next=/x'], ['/forgot-password'], ['/reset-password'],
  ])('falls back for %j', (input) => expect(safeReturnTarget(input)).toBe('/dashboard'))
})
