import { simulateLatency, simulateFailure, getFailureRate } from './latency'
import type { User } from '../types'

const STORAGE_KEY = 'sakramentohub_mock_current_user'

export async function fetchCurrentUser(): Promise<User | null> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to fetch current user')
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

export async function updateCurrentUser(patch: Partial<User>): Promise<User> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to update current user')
  const raw = localStorage.getItem(STORAGE_KEY)
  const current = raw ? JSON.parse(raw) : null
  if (!current) throw new Error('No current user')
  const updated = { ...current, ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

export function setCurrentUser(user: User): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

export function clearCurrentUser(): void {
  localStorage.removeItem(STORAGE_KEY)
}
