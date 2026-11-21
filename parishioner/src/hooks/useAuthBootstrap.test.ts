import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { useAuthBootstrap } from './useAuthBootstrap'
import { useAuthStore } from '../stores/auth-store'
import { setCurrentUser } from '../lib/mock/users'

describe('useAuthBootstrap', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ user: null, isBootstrapping: true })
  })

  it('rehydrates the auth store from a session already in localStorage', async () => {
    setCurrentUser({ id: '1', fullName: 'Rio Dela Cruz', email: 'rio@example.com', phone: '', address: '' })

    renderHook(() => useAuthBootstrap())

    await waitFor(() => {
      expect(useAuthStore.getState().user?.fullName).toBe('Rio Dela Cruz')
    })
  })

  it('leaves the auth store empty when no session exists', async () => {
    renderHook(() => useAuthBootstrap())

    // give the effect a tick to (not) resolve
    await new Promise((r) => setTimeout(r, 50))
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('flips isBootstrapping to false once the fetch settles, with or without a session', async () => {
    renderHook(() => useAuthBootstrap())

    expect(useAuthStore.getState().isBootstrapping).toBe(true)
    await waitFor(() => {
      expect(useAuthStore.getState().isBootstrapping).toBe(false)
    })
  })
})
