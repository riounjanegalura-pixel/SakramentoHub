import { describe, it, expect, beforeEach } from 'vitest'
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications'

describe('notification preferences', () => {
  beforeEach(() => localStorage.clear())

  it('defaults every preference to enabled', async () => {
    const prefs = await fetchNotificationPreferences()
    expect(prefs).toEqual({ pushEnabled: true, bookingReminders: true, parishAnnouncements: true })
  })

  it('persists a patched preference', async () => {
    await updateNotificationPreferences({ pushEnabled: false })
    const prefs = await fetchNotificationPreferences()
    expect(prefs.pushEnabled).toBe(false)
    expect(prefs.bookingReminders).toBe(true)
  })
})

describe('notifications feed', () => {
  beforeEach(() => localStorage.clear())

  it('returns notifications grouped by today/earlier', async () => {
    const notifications = await fetchNotifications()
    expect(notifications.some((n) => n.category === 'today')).toBe(true)
    expect(notifications.some((n) => n.category === 'earlier')).toBe(true)
  })

  it('marks every notification read', async () => {
    await markAllNotificationsRead()
    const notifications = await fetchNotifications()
    expect(notifications.every((n) => n.read)).toBe(true)
  })

  it('marks a single notification read without affecting the others', async () => {
    const [first, second] = await fetchNotifications()
    await markNotificationRead(first.id)
    const notifications = await fetchNotifications()
    expect(notifications.find((n) => n.id === first.id)?.read).toBe(true)
    expect(notifications.find((n) => n.id === second.id)?.read).toBe(false)
  })
})
