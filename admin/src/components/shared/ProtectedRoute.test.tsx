import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuthStore } from '../../stores/auth-store'

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/bookings']}>
      <Routes>
        <Route
          path="/bookings"
          element={
            <ProtectedRoute>
              <div>Bookings Screen</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Screen</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isBootstrapping: false })
  })

  it('redirects to /login when logged out and bootstrap has settled', () => {
    renderGuarded()
    expect(screen.getByText('Login Screen')).toBeInTheDocument()
    expect(screen.queryByText('Bookings Screen')).not.toBeInTheDocument()
  })

  it('renders children for a staff user', () => {
    useAuthStore.setState({
      user: { id: '1', fullName: 'Staff One', email: 's@x.com', phone: '', address: '', role: 'staff', isActive: true },
    })
    renderGuarded()
    expect(screen.getByText('Bookings Screen')).toBeInTheDocument()
  })

  it('renders children for an admin user', () => {
    useAuthStore.setState({
      user: { id: '2', fullName: 'Admin One', email: 'a@x.com', phone: '', address: '', role: 'admin', isActive: true },
    })
    renderGuarded()
    expect(screen.getByText('Bookings Screen')).toBeInTheDocument()
  })

  it('redirects a parishioner role to /login instead of admitting them', () => {
    useAuthStore.setState({
      user: { id: '3', fullName: 'Rio', email: 'r@x.com', phone: '', address: '', role: 'parishioner', isActive: true },
    })
    renderGuarded()
    expect(screen.getByText('Login Screen')).toBeInTheDocument()
    expect(screen.queryByText('Bookings Screen')).not.toBeInTheDocument()
  })

  it('renders nothing (no redirect) while auth bootstrap is still in flight', () => {
    useAuthStore.setState({ user: null, isBootstrapping: true })
    renderGuarded()
    expect(screen.queryByText('Bookings Screen')).not.toBeInTheDocument()
    expect(screen.queryByText('Login Screen')).not.toBeInTheDocument()
  })

  it('upgrades to a cold-start message once bootstrap has stayed pending for 3+ seconds', () => {
    vi.useFakeTimers()
    useAuthStore.setState({ user: null, isBootstrapping: true })
    renderGuarded()

    expect(screen.queryByText(/waking up the server/i)).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText(/waking up the server/i)).toBeInTheDocument()
    vi.useRealTimers()
  })
})
