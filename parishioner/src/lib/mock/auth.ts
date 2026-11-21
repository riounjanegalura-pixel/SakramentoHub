import { simulateLatency, simulateFailure, getFailureRate } from './latency'
import { setCurrentUser } from './users'
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

export async function login(email: string, _password: string): Promise<User> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to log in')
  const user: User = {
    id: crypto.randomUUID(),
    fullName: 'Rio Dela Cruz',
    email,
    phone: '',
    address: '',
    // A mock login has no real registration behind it — treated as already
    // verified so the mock demo isn't perpetually stuck behind the
    // email-verification gate.
    emailVerifiedAt: new Date().toISOString(),
  }
  setCurrentUser(user)
  return user
}

export async function register(input: RegisterInput): Promise<User> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to register')
  // Mirrors the real backend's RegisterRequest rule — mock mode should
  // enforce the same real rule, not a weaker one, so dev/demo behavior
  // actually matches production.
  if (!input.birthDate || !input.sex) throw new Error('Enter your date of birth and sex.')
  if (!input.privacyConsent) throw new Error('You must agree to the Privacy Notice to create an account.')
  const user: User = {
    id: crypto.randomUUID(),
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    address: '',
    birthDate: input.birthDate,
    sex: input.sex,
    homeParish: 'St. Peter the Apostle Parish, Balagtas',
    // Mirrors the real backend: a fresh registration is unverified until
    // the mock verify-email flow below runs.
    emailVerifiedAt: null,
  }
  setCurrentUser(user)
  return user
}

const MOCK_PASSWORD = 'password123'

export async function changePassword(currentPassword: string, _newPassword: string): Promise<void> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to change password')
  if (currentPassword !== MOCK_PASSWORD) throw new Error('Current password is incorrect')
  // Nothing to persist — this mock never stores a real password.
}

/** Mirrors the real endpoint's no-enumeration-leak contract: always
 * resolves, whatever the email. Mock mode has no server log to write to, so
 * there's genuinely nothing more for this to do. */
export async function forgotPassword(_email: string): Promise<void> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to request a password reset')
}

/** Enforces the same real validation shape (non-empty token, matching
 * password rules) the backend does, without pretending to check a token
 * against a real emailed value — there is no real email in mock mode. */
export async function resetPassword(
  token: string,
  _email: string,
  password: string,
  passwordConfirmation: string
): Promise<void> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to reset password')
  if (!token) throw new Error('This reset link is invalid or has expired.')
  if (password !== passwordConfirmation) throw new Error('Passwords do not match')
  // Nothing to persist — this mock never stores a real password.
}

export async function resendVerificationEmail(): Promise<void> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to resend verification email')
}

export async function verifyEmailCode(code: string): Promise<void> {
  await simulateLatency()
  if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit code.')
  const raw = localStorage.getItem('sakramentohub_mock_current_user')
  if (raw) setCurrentUser({ ...(JSON.parse(raw) as User), emailVerifiedAt: new Date().toISOString() })
}

export async function verifyEmail(token: string, _email: string): Promise<void> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to verify email')
  if (!token) throw new Error('This verification link is invalid or has expired.')
  const raw = localStorage.getItem('sakramentohub_mock_current_user')
  if (raw) {
    const current = JSON.parse(raw) as User
    setCurrentUser({ ...current, emailVerifiedAt: new Date().toISOString() })
  }
}
