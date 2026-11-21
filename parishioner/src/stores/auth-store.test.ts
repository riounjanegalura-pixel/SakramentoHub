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

  it('clears the query cache so the next person on a shared computer sees none of it', async () => {
    queryClient.setQueryData(['notifications'], [{ id: 'n1' }])
    await useAuthStore.getState().logout()
    expect(queryClient.getQueryData(['notifications'])).toBeUndefined()
  })
})
