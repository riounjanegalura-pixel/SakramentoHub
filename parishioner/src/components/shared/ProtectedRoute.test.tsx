import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuthStore } from '../../stores/auth-store'

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isBootstrapping: false })
  })

  it('redirects to /login when logged out and bootstrap has settled', () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <div>Home Screen</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Screen</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Login Screen')).toBeInTheDocument()
    expect(screen.queryByText('Home Screen')).not.toBeInTheDocument()
  })

  it('renders children when a user is logged in', () => {
    useAuthStore.setState({ user: { id: '1', fullName: 'Rio', email: 'r@x.com', phone: '', address: '' } })

    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <div>Home Screen</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Screen</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Home Screen')).toBeInTheDocument()
  })

  it('renders nothing (no redirect) while auth bootstrap is still in flight', () => {
    useAuthStore.setState({ user: null, isBootstrapping: true })

    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <div>Home Screen</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Screen</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByText('Home Screen')).not.toBeInTheDocument()
    expect(screen.queryByText('Login Screen')).not.toBeInTheDocument()
  })

  it('upgrades to a cold-start message once bootstrap has stayed pending for 3+ seconds', () => {
    vi.useFakeTimers()
    useAuthStore.setState({ user: null, isBootstrapping: true })

    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <div>Home Screen</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Screen</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByText(/waking up the server/i)).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText(/waking up the server/i)).toBeInTheDocument()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function renderHome() {
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/home']}>
          <Routes>
            <Route path="/home" element={<ProtectedRoute><div>Home Screen</div></ProtectedRoute>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('holds a parishioner who has not confirmed their email on a Check your email screen', () => {
    useAuthStore.setState({ user: { id: '1', fullName: 'Rio', email: 'rio@x.com', phone: '', address: '', role: 'parishioner', emailVerifiedAt: null } })
    renderHome()
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText('rio@x.com')).toBeInTheDocument()
    expect(screen.queryByText('Home Screen')).not.toBeInTheDocument()
  })

  it('lets a verified parishioner, and any staff or admin account, straight in', () => {
    useAuthStore.setState({ user: { id: '1', fullName: 'Rio', email: 'r@x.com', phone: '', address: '', role: 'parishioner', emailVerifiedAt: '2026-01-01' } })
    const { unmount } = renderHome()
    expect(screen.getByText('Home Screen')).toBeInTheDocument()
    unmount()
    useAuthStore.setState({ user: { id: '2', fullName: 'Ana', email: 'a@x.com', phone: '', address: '', role: 'admin', emailVerifiedAt: null } })
    renderHome()
    expect(screen.getByText('Home Screen')).toBeInTheDocument()
  })
})
