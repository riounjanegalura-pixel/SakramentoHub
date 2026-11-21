import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarCheck, Megaphone } from 'lucide-react'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '../../lib/data/notifications'

const ROWS: { key: keyof NotificationPreferences; icon: typeof Bell; title: string; description: string }[] = [
  { key: 'pushEnabled', icon: Bell, title: 'Push Notifications', description: 'You will receive notifications' },
  { key: 'bookingReminders', icon: CalendarCheck, title: 'Booking Reminders', description: 'Emails before your appointment and before a payment window closes. Updates about your own requests are always sent.' },
  { key: 'parishAnnouncements', icon: Megaphone, title: 'Parish Announcement', description: 'events from the parish' },
]

export function NotificationPreferencesScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    data: prefs,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['notification-prefs'], queryFn: fetchNotificationPreferences })

  const mutation = useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: (updated) => queryClient.setQueryData(['notification-prefs'], updated),
  })

  return (
    <AppShell header={<AppHeader title="Notification Preferences" onBack={() => navigate(-1)} />}>
      <section aria-labelledby="notification-prefs-heading" className="mx-auto w-full max-w-xl px-4 py-6">
        <h2 id="notification-prefs-heading" className="border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">
          Notifications
        </h2>
        <p className="mb-4 mt-1 text-sm text-ink-muted">Each switch saves as soon as you change it.</p>

        {isLoading && (
          <ul aria-hidden="true" className="flex flex-col gap-3">
            {ROWS.map(({ key }) => (
              <li key={key}>
                <Skeleton className="h-[4.5rem] w-full rounded-2xl" />
              </li>
            ))}
          </ul>
        )}

        {isError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger bg-status-rejected-bg p-4">
            <p className="min-w-0 flex-1 text-sm font-medium text-status-rejected-fg">
              Couldn&apos;t load your notification preferences. Check your connection and try again.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && (
          <ul className="flex flex-col gap-3">
            {ROWS.map(({ key, icon: Icon, title, description }) => (
              <li key={key}>
                <label className="relative flex min-h-11 items-center gap-3 rounded-2xl border border-line bg-surface p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
                  {/* The input covers the whole row, so the target is the row; the track and thumb are drawn from its checked state. */}
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={title}
                    checked={prefs?.[key] ?? true}
                    onChange={(e) => mutation.mutate({ [key]: e.target.checked })}
                    className="peer absolute inset-0 z-10 size-full cursor-pointer appearance-none rounded-2xl"
                  />
                  <Icon size={20} className="shrink-0 text-navy" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{title}</span>
                    <span className="block text-sm text-ink-muted">{description}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-ink-muted peer-checked:bg-navy peer-checked:[&>span]:translate-x-5"
                  >
                    <span className="absolute left-0.5 size-5 rounded-full bg-surface border border-line" />
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 min-h-6">
          {mutation.isPending && <p role="status" className="text-sm text-ink-muted">Saving…</p>}
          {mutation.isSuccess && <p role="status" className="text-sm font-medium text-status-done-fg">Notification preferences saved.</p>}
          {mutation.isError && (
            <p role="alert" className="text-sm font-medium text-danger">
              Couldn&apos;t save your notification preferences. Check your connection and try again.
            </p>
          )}
        </div>
      </section>
    </AppShell>
  )
}
