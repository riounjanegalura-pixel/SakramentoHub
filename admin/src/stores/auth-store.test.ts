import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './auth-store'
import { queryClient } from '../lib/query-client'
import * as authApi from '../lib/data/auth'

describe('auth store', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('clears the query cache on logout', async () => {
    vi.spyOn(authApi, 'logout').mockResolvedValue(undefined)
    queryClient.setQueryData(['notifications'], [{ id: 'n1' }])
    await useAuthStore.getState().logout()
    expect(queryClient.getQueryData(['notifications'])).toBeUndefined()
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('still clears the session and the cache when the server logout fails', async () => {
    vi.spyOn(authApi, 'logout').mockRejectedValue(new Error('offline'))
    queryClient.setQueryData(['notifications'], [{ id: 'n1' }])
    useAuthStore.setState({ user: { id: 'a1' } as never })
    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined()
    expect(queryClient.getQueryData(['notifications'])).toBeUndefined()
    expect(useAuthStore.getState().user).toBeNull()
  })
})
