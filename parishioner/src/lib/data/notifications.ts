import * as mock from '../mock/notifications'
import * as api from '../api/notifications'
import { useApi } from './useApi'

export const fetchNotificationPreferences = useApi
  ? api.fetchNotificationPreferences
  : mock.fetchNotificationPreferences
export const updateNotificationPreferences = useApi
  ? api.updateNotificationPreferences
  : mock.updateNotificationPreferences
export const fetchNotifications = useApi ? api.fetchNotifications : mock.fetchNotifications
export const markAllNotificationsRead = useApi ? api.markAllNotificationsRead : mock.markAllNotificationsRead
export const markNotificationRead = useApi ? api.markNotificationRead : mock.markNotificationRead
export type { NotificationPreferences, AppNotification } from './notifications.types'
