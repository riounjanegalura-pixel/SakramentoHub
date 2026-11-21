import { ApiError, apiFetch, clearAuthToken } from './client'
import type { User } from '../types'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)) // timer: wait before retrying a sleeping server

/**
 * The signed-in person, or null. Only a 401 (the token is no longer valid) means "signed out" and drops the saved
 * token. A sleeping server, a 5xx or a rate limit is not a sign-out: it is tried again a few times so a refresh
 * does not send a person with a good session back to the sign-in screen.
 */
export async function fetchCurrentUser(retryDelaysMs: number[] = [1500, 3000, 6000]): Promise<User | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await apiFetch<User>('/me')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearAuthToken()
        return null
      }
      if (attempt >= retryDelaysMs.length) return null
      await wait(retryDelaysMs[attempt])
    }
  }
}

export async function updateCurrentUser(patch: Partial<User>): Promise<User> {
  return apiFetch<User>('/me', { method: 'PATCH', body: JSON.stringify(patch) })
}
