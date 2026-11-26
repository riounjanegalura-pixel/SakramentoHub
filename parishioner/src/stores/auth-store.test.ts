import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from './auth-store'
import { queryClient } from '../lib/query-client'

// Deviation from task-12-brief.md: the brief's skeleton mocks
// '../lib/mock/users' for clearCurrentUser, but Task 11 already rewired
// auth-store.ts to import clearCurrentUser from the '../lib/data/users'
// facade (which itself switches between mock.clearCurrentUser and a
// no-op depending on VITE_API_URL). Mocking the facade module here matches
// what auth-store.ts actually imports.
vi.mock('../lib/data/auth', () => ({ logout: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/data/users', () => ({ clearCurrentUser: vi.fn() }))

describe('useAuthStore.logout', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: '1', fullName: 'Rio', email: 'r@x.com', phone: '', address: '' } })
  })

  it('calls the data-layer logout and clears the store', async () => {
    const { logout: apiLogout } = await import('../lib/data/auth')

    await useAuthStore.getState().logout()

    expect(apiLogout).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('throws away an unfinished booking, so the next person on a shared computer does not find it', async () => {
    const { useBookingStore } = await import('./booking-store')
    useBookingStore.getState().startBooking('baptism')
    useBookingStore.getState().updateFormData({ childFirstName: 'Rio' })

    await useAuthStore.getState().logout()

    expect(useBookingStore.getState().formData).toEqual({})
    expect(localStorage.getItem('sakramentohub_booking_draft')).toBeNull()
  })

  it('signing in claims the unfinished booking, or drops it when it belonged to someone else', async () => {
    const { useBookingStore } = await import('./booking-store')
    useBookingStore.getState().startBooking('baptism')
    useBookingStore.getState().updateFormData({ childFirstName: 'Rio' })

    useAuthStore.getState().setUser({ id: '1', fullName: 'Rio', email: 'r@x.com', phone: '', address: '' })
    expect(useBookingStore.getState().formData).toEqual({ childFirstName: 'Rio' })

    useAuthStore.getState().setUser({ id: '2', fullName: 'Ana', email: 'a@x.com', phone: '', address: '' })
    expect(useBookingStore.getState().formData).toEqual({})
  })

  it('clears the query cache so the next person on a shared computer sees none of it', async () => {
    queryClient.setQueryData(['notifications'], [{ id: 'n1' }])
    await useAuthStore.getState().logout()
    expect(queryClient.getQueryData(['notifications'])).toBeUndefined()
  })
})
