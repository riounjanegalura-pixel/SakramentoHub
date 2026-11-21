import { apiFetch } from './client'
import type { AdminService, AdminSettings, Blackout, BlackoutInput, BlackoutResult, ParishSettings, ServiceUpdate } from '../types'

export async function fetchSettings(): Promise<AdminSettings> {
  return apiFetch<AdminSettings>('/admin/settings')
}

/** Admin only (server `role:admin`). Send only the keys that changed. */
export async function updateParishSettings(input: Partial<ParishSettings>): Promise<ParishSettings> {
  return apiFetch<ParishSettings>('/admin/settings/parish', { method: 'PATCH', body: JSON.stringify(input) })
}

/** Admin only. Send only the keys that changed. */
export async function updateServiceSettings(id: string, input: ServiceUpdate): Promise<AdminService> {
  return apiFetch<AdminService>(`/admin/settings/services/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

/** Plain array of closures dated today or later. */
export async function fetchBlackouts(): Promise<Blackout[]> {
  return apiFetch<Blackout[]>('/admin/blackouts')
}

export async function createBlackouts(input: BlackoutInput): Promise<BlackoutResult> {
  return apiFetch<BlackoutResult>('/admin/blackouts', { method: 'POST', body: JSON.stringify(input) })
}

export async function deleteBlackout(id: number): Promise<void> {
  return apiFetch<void>(`/admin/blackouts/${id}`, { method: 'DELETE' })
}
