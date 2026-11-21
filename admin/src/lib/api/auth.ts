import { apiFetch, setAuthToken, clearAuthToken } from './client'
import type { User } from '../types'

export async function login(email: string, password: string): Promise<User> {
  const { user, token } = await apiFetch<{ user: User; token: string }>('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setAuthToken(token)
  return user
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<void>('/logout', { method: 'POST' })
  } finally {
    clearAuthToken()
  }
}

export async function fetchCurrentUser(): Promise<User> {
  return apiFetch<User>('/me')
}

/** Always resolves — the backend returns the same generic success response
 * whether or not the email belongs to an account (no user-enumeration
 * leak), so there is no "failure" case for a caller to distinguish here. */
export async function forgotPassword(email: string): Promise<void> {
  await apiFetch<void>('/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function resetPassword(
  token: string,
  email: string,
  password: string,
  passwordConfirmation: string
): Promise<void> {
  await apiFetch<void>('/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, email, password, passwordConfirmation }),
  })
}
