import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { durations, ease } from '../../lib/motion'
import { Link } from 'react-router-dom'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../../lib/data/notifications'
import { formatManilaDateTime } from '../../lib/domain'
import { cn } from '../../lib/utils'

const POLL_MS = 60_000

/**
 * Staff alerts the system already writes ("Refund due", "Urgent anointing
 * request", "Partial refund due"…). Unread count on the bell, a dropdown with
 * mark read / mark all read, refreshed every 60 seconds.
 */
export function NotificationBell() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const { data: items = [] } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => fetchNotifications(),
    refetchInterval: POLL_MS,
  })
  const unread = items.filter((n) => !n.read).length

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-notifications'] })
  // Wrapped (not passed by reference) so the mutation's extra arguments never reach the API function.
  const markOne = useMutation({ mutationFn: (id: string) => markNotificationRead(id), onSuccess: refresh })
  const markAll = useMutation({ mutationFn: () => markAllNotificationsRead(), onSuccess: refresh })

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={root} className="relative print:hidden">
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-11 lg:size-10 items-center justify-center rounded-full border border-line bg-surface text-navy hover:bg-line/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-5 rounded-full bg-danger px-1 text-center text-label font-semibold leading-5 text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
      {open && (
        <m.div
          role="dialog"
          aria-label="Notifications"
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: durations.base, ease: [...ease] } }}
          exit={{ opacity: 0, y: -4, transition: { duration: durations.quick } }}
          style={{ transformOrigin: 'top right' }}
          className="absolute right-0 z-20 mt-2 flex max-h-[560px] w-[400px] max-w-[90vw] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-display text-xl font-semibold text-navy">Notifications</h2>
            {unread > 0 && (
              <button type="button" disabled={markAll.isPending} onClick={() => markAll.mutate()} className="min-h-11 px-1 text-body font-semibold text-navy underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 py-10 text-center">
              <Bell size={28} aria-hidden="true" className="text-ink-muted" />
              <p className="text-body font-semibold text-ink">No notifications</p>
              <p className="text-body text-ink-muted">New bookings, payments and urgent requests show up here.</p>
            </div>
          ) : (
            <ul className="overflow-y-auto">
              {items.map((n) => {
                const target = n.link ?? (n.bookingId ? `/bookings/${n.bookingId}` : null)
                const rowClass = cn('flex min-h-[68px] w-full gap-3 px-5 py-3.5 text-left hover:bg-line/30 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus', !n.read && 'bg-status-pending-bg')
                const content = (
                  <>
                    <span aria-hidden="true" className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-status-pending-fg')} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn('text-body text-ink', !n.read && 'font-semibold')}>{n.title}</span>
                      {n.body && <span className="text-body text-ink">{n.body}</span>}
                      <span className="text-label text-ink-muted">
                        {n.createdAt ? formatManilaDateTime(n.createdAt) : ''}
                        {!n.read && <span className="sr-only"> (unread)</span>}
                      </span>
                    </span>
                  </>
                )
                return (
                  <li key={n.id} className="border-b border-line last:border-0">
                    {target ? (
                      <Link
                        to={target}
                        onClick={() => {
                          if (!n.read) markOne.mutate(n.id)
                          setOpen(false)
                        }}
                        className={rowClass}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (!n.read) markOne.mutate(n.id)
                        }}
                        className={rowClass}
                      >
                        {content}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </m.div>
      )}
      </AnimatePresence>
    </div>
  )
}
