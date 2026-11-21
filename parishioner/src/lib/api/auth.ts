import { apiFetch, setAuthToken, clearAuthToken } from './client'
import type { User } from '../types'

export interface RegisterInput {
  fullName: string
  email: string
  phone: string
  birthDate: string
  sex: 'male' | 'female'
  password: string
  privacyConsent: boolean
}

export async function login(email: string, password: string): Promise<User> {
  const { user, token } = await apiFetch<{ user: User; token: string }>('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setAuthToken(token)
  return user
}

export async function register(input: RegisterInput): Promise<User> {
  const { user, token } = await apiFetch<{ user: User; token: string }>('/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  setAuthToken(token)
  return user
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch<void>('/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function logout(): Promise<void> {
  await apiFetch<void>('/logout', { method: 'POST' })
  clearAuthToken()
}

/** Always resolves — the backend returns the same generic success response
 * whether or not the email belongs to an account (no user-enumeration
 * leak), so there is no "failure" case to distinguish here. */
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

export async function resendVerificationEmail(): Promise<void> {
  await apiFetch<void>('/email/verification-notification', { method: 'POST' })
}

/** The 6-digit code from the verification email, typed in the app (no link needed). */
export async function verifyEmailCode(code: string): Promise<void> {
  await apiFetch<void>('/email/verify-code', { method: 'POST', body: JSON.stringify({ code }) })
}

export async function verifyEmail(token: string, email: string): Promise<void> {
  await apiFetch<void>('/email/verify', {
    method: 'POST',
    body: JSON.stringify({ token, email }),
  })
}
