import { apiFetch } from './client'
import type { AppNotification } from '../types'

/** The signed-in user's own notifications (staff alerts included), newest first. */
export async function fetchNotifications(): Promise<AppNotification[]> {
  return apiFetch<AppNotification[]>('/notifications')
}

export async function markNotificationRead(id: string): Promise<void> {
  return apiFetch<void>(`/notifications/${id}/read`, { method: 'POST' })
}

export async function markAllNotificationsRead(): Promise<void> {
  return apiFetch<void>('/notifications/mark-all-read', { method: 'POST' })
}
