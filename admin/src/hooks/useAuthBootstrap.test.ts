import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthBootstrap } from './useAuthBootstrap'
import { useAuthStore } from '../stores/auth-store'
import { ApiError, getAuthToken, setAuthToken } from '../lib/api/client'

const fetchCurrentUser = vi.fn()
vi.mock('../lib/data/auth', () => ({
  fetchCurrentUser: (...a: unknown[]) => fetchCurrentUser(...a),
}))

const staff = { id: 's1', fullName: 'Staff User', email: 'staff@example.com', role: 'staff', isActive: true }

describe('useAuthBootstrap (admin)', () => {
  beforeEach(() => {
    localStorage.clear()
    fetchCurrentUser.mockReset()
    useAuthStore.setState({ user: null, isBootstrapping: true })
  })

  it('rehydrates the signed-in user from a stored token', async () => {
    setAuthToken('tok')
    fetchCurrentUser.mockResolvedValue(staff)
    renderHook(() => useAuthBootstrap())
    await waitFor(() => expect(useAuthStore.getState().user?.fullName).toBe('Staff User'))
    expect(getAuthToken()).toBe('tok')
  })

  it('finishes at once without a token and never calls the server', async () => {
    renderHook(() => useAuthBootstrap())
    await waitFor(() => expect(useAuthStore.getState().isBootstrapping).toBe(false))
    expect(fetchCurrentUser).not.toHaveBeenCalled()
  })

  it('forgets the token when the server says it is no longer valid (401)', async () => {
    setAuthToken('tok')
    fetchCurrentUser.mockRejectedValue(new ApiError('Unauthenticated.', 401, null))
    renderHook(() => useAuthBootstrap())
    await waitFor(() => expect(useAuthStore.getState().isBootstrapping).toBe(false))
    expect(getAuthToken()).toBeNull()
  })

  // A sleeping host, a dropped connection or a page reloaded mid-request is not a sign-out:
  // the token must survive so the next load is signed in again.
  it('keeps the token when the check fails for any other reason', async () => {
    setAuthToken('tok')
    fetchCurrentUser.mockRejectedValue(new TypeError('Failed to fetch'))
    renderHook(() => useAuthBootstrap())
    await waitFor(() => expect(useAuthStore.getState().isBootstrapping).toBe(false))
    expect(getAuthToken()).toBe('tok')

    useAuthStore.setState({ user: null, isBootstrapping: true })
    fetchCurrentUser.mockRejectedValue(new ApiError('Server Error', 503, null))
    renderHook(() => useAuthBootstrap())
    await waitFor(() => expect(useAuthStore.getState().isBootstrapping).toBe(false))
    expect(getAuthToken()).toBe('tok')
  })
})
