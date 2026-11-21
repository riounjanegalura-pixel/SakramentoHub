import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CheckCheck, ChevronRight } from 'lucide-react'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { Skeleton } from '../../components/ui/skeleton'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../../lib/data/notifications'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/** "9:30 AM" for today's items, "Oct 8" for earlier ones, always in the parish's time zone. */
function whenText(iso: string, category: AppNotification['category']): string {
  const opts: Intl.DateTimeFormatOptions =
    category === 'today' ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' }
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', ...opts })
}

function Section({
  label,
  items,
  onSelect,
}: {
  label: string
  items: AppNotification[]
  onSelect: (notification: AppNotification) => void | Promise<void>
}) {
  if (items.length === 0) return null
  return (
    <section aria-label={label}>
      <h2 className="mb-1 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">{label}</h2>
      <ul className="divide-y divide-line border-y border-line">
        {items.map((n) => {
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onSelect(n)}
                className={`flex min-h-16 w-full items-start gap-3 px-1 py-3 text-left hover:bg-line/30 ${n.read ? '' : 'shadow-[inset_3px_0_0_var(--navy)] pl-3'} ${FOCUS}`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block text-body text-ink ${n.read ? 'font-medium' : 'font-semibold'}`}>{n.title}</span>
                  <span className="block text-note text-ink-muted">{n.body}</span>
                  {n.createdAt && (
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {n.createdAt && (
                        <time dateTime={n.createdAt} className="tabular-nums text-label text-ink-muted">
                          {whenText(n.createdAt, n.category)}
                        </time>
                      )}
                    </span>
                  )}
                </span>
                {!n.read && (
                  <span className="mt-0.5 shrink-0 rounded-full bg-navy px-3 py-1 text-label font-semibold text-white">New</span>
                )}
                {n.bookingId && <ChevronRight size={20} className="mt-1 shrink-0 text-ink-muted" aria-hidden="true" />}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="mb-1 h-4 w-16" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[4.75rem] w-full rounded-xl" />
      ))}
    </div>
  )
}

export function NotificationsFeedScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    data: notifications,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['notifications'], queryFn: fetchNotifications })

  const mutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  async function handleSelectNotification(notification: AppNotification) {
    if (!notification.bookingId) {
      if (!notification.read) markReadMutation.mutate(notification.id)
      return
    }
    // Mark read first, but never let a failed call keep the parishioner from the booking.
    if (!notification.read) await markReadMutation.mutateAsync(notification.id).catch(() => undefined)
    navigate(`/booking/history/${notification.bookingId}`)
  }

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0
  const hasNotifications = (notifications?.length ?? 0) > 0

  return (
    <AppShell
      showBottomNav={false}
      webFrame
      header={
        <AppHeader
          title="Notifications"
          subtitle={notifications ? `${unreadCount} unread` : undefined}
          onBack={() => navigate(-1)}
          action={
            hasNotifications ? (
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className={`inline-flex min-h-11 items-center gap-1 rounded-full border border-current px-3 text-sm font-medium disabled:opacity-50 ${FOCUS}`}
              >
                <CheckCheck size={16} aria-hidden="true" />
                Mark all read
              </button>
            ) : undefined
          }
        />
      }
    >
      <div aria-busy={isLoading} className="flex flex-col gap-6 p-4">
        {mutation.isError && (
          <p role="alert" className="text-sm font-medium text-danger">
            Couldn&apos;t mark your notifications as read. Try again.
          </p>
        )}
        {isLoading && (
          <>
            <p className="sr-only">Loading notifications</p>
            <FeedSkeleton />
          </>
        )}
        {isError && (
          <p role="alert" className="text-sm text-danger">
            Couldn&apos;t load your notifications.{' '}
            <button type="button" onClick={() => void refetch()} className={`min-h-11 font-semibold underline ${FOCUS}`}>
              Retry
            </button>
          </p>
        )}
        {!isLoading && !isError && !hasNotifications && (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center">
            <p className="font-display text-base font-semibold text-ink">You&apos;re all caught up.</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
              Reminders and updates about your bookings and the parish show up here.
            </p>
          </div>
        )}
        <Section
          label="TODAY"
          items={notifications?.filter((n) => n.category === 'today') ?? []}
          onSelect={handleSelectNotification}
        />
        <Section
          label="EARLIER"
          items={notifications?.filter((n) => n.category === 'earlier') ?? []}
          onSelect={handleSelectNotification}
        />
      </div>
    </AppShell>
  )
}
