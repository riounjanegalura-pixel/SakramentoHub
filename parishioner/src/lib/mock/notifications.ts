import { simulateLatency, simulateFailure, getFailureRate } from './latency'

export interface NotificationPreferences {
  pushEnabled: boolean
  bookingReminders: boolean
  parishAnnouncements: boolean
}

export interface AppNotification {
  id: string
  title: string
  body: string
  category: 'today' | 'earlier'
  read: boolean
  icon: 'calendar' | 'booking' | 'announcement'
  bookingId: string | null
  /** When it was created (ISO 8601). The API sends it; absent only on old cached data. */
  createdAt?: string | null
}

const PREFS_KEY = 'sakramentohub_mock_notification_prefs'
const READ_KEY = 'sakramentohub_mock_notifications_read'

const DEFAULT_PREFS: NotificationPreferences = {
  pushEnabled: true,
  bookingReminders: true,
  parishAnnouncements: true,
}

/** How long before "now" each seeded notification was created, so the feed shows a time. */
const SEED_AGE_MINUTES: Record<string, number> = { 'n-1': 30, 'n-2': 90, 'n-3': 3 * 24 * 60 }

const SEED_NOTIFICATIONS: Omit<AppNotification, 'read'>[] = [
  { id: 'n-1', title: 'Mass Reminder', body: 'Sunday Morning Mass starts in 2 hours', category: 'today', icon: 'calendar', bookingId: null },
  { id: 'n-2', title: 'Baptism Schedule', body: 'Your baptism ceremony is confirmed for March 22', category: 'today', icon: 'booking', bookingId: 'bk-1' },
  { id: 'n-3', title: 'Parish Announcement', body: 'New Lenten schedule has been posted', category: 'earlier', icon: 'announcement', bookingId: null },
]

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to fetch notification preferences')
  const raw = localStorage.getItem(PREFS_KEY)
  return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS
}

export async function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to update notification preferences')
  const raw = localStorage.getItem(PREFS_KEY)
  const current = raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS
  const updated = { ...current, ...patch }
  localStorage.setItem(PREFS_KEY, JSON.stringify(updated))
  return updated
}

function getReadIds(): Set<string> {
  const raw = localStorage.getItem(READ_KEY)
  if (!raw) return new Set()
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed) : new Set()
  } catch {
    return new Set()
  }
}

function setReadIds(ids: Set<string>): void {
  localStorage.setItem(READ_KEY, JSON.stringify([...ids]))
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to fetch notifications')
  const readIds = getReadIds()
  const now = Date.now()
  return SEED_NOTIFICATIONS.map((n) => ({
    ...n,
    read: readIds.has(n.id),
    createdAt: new Date(now - SEED_AGE_MINUTES[n.id] * 60_000).toISOString(),
  }))
}

export async function markAllNotificationsRead(): Promise<void> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to mark notifications read')
  setReadIds(new Set(SEED_NOTIFICATIONS.map((n) => n.id)))
}

export async function markNotificationRead(id: string): Promise<void> {
  await simulateLatency()
  if (simulateFailure(getFailureRate())) throw new Error('Failed to mark notification read')
  const readIds = getReadIds()
  readIds.add(id)
  setReadIds(readIds)
}
