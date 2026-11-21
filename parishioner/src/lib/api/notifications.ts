import { apiFetch } from './client'
import type { NotificationPreferences, AppNotification } from '../mock/notifications'

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>('/notification-preferences')
}

export async function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>('/notification-preferences', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  return apiFetch<AppNotification[]>('/notifications')
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch<void>('/notifications/mark-all-read', { method: 'POST' })
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch<void>(`/notifications/${id}/read`, { method: 'POST' })
}
