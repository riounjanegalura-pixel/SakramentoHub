import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchNotifications } from '../../lib/data/notifications'
import { useAuthStore } from '../../stores/auth-store'
import { cn } from '../../lib/utils'

/** The header bell with an unread count; on every tab, because Notifications has no tab of its own. `onNavy` is for a navy Panel. */
export function NotificationsLink({ onNavy = false }: { onNavy?: boolean }) {
  const user = useAuthStore((s) => s.user)
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: fetchNotifications, enabled: !!user })
  const unread = (data ?? []).filter((n) => !n.read).length
  return (
    <Link
      to="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className={cn(
        'relative flex size-12 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        onNavy ? 'text-white hover:bg-white/10' : 'text-navy hover:bg-line/40',
      )}
    >
      <Bell aria-hidden="true" />
      {unread > 0 && (
        <span aria-hidden="true" className="absolute right-0.5 top-0.5 min-w-5 rounded-full bg-danger px-1 text-center text-label font-semibold leading-5 text-white">
          {unread}
        </span>
      )}
    </Link>
  )
}
