import { simulateLatency, simulateFailure, getFailureRate } from './latency'
import { clearCurrentUser } from './users'

const MOCK_PASSWORD = 'password123'
const STORAGE_KEY = 'sakramentohub_mock_current_user'

/** Mirrors the real /me/export endpoint's shape closely enough for the mock
 * demo to exercise the same "download a real file" UI path — built from
 * whatever the mock currently has in localStorage rather than invented data,
 * so it stays consistent with what Profile/Booking History show. */
export async function exportMyData(): Promise<Blob> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to export your data')

  const raw = localStorage.getItem(STORAGE_KEY)
  const profile = raw ? JSON.parse(raw) : null

  const payload = {
    exportedAt: new Date().toISOString(),
    profile,
    bookings: [],
    notifications: [],
    notificationPreferences: null,
  }

  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

/** Mirrors the real endpoint's password re-confirmation contract without a
 * real backing store — same fixed mock password used by mock changePassword. */
export async function deleteAccount(currentPassword: string): Promise<void> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to delete your account')
  if (currentPassword !== MOCK_PASSWORD) throw new Error('Current password is incorrect')
  clearCurrentUser()
}
