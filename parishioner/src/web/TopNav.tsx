import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { fetchNotifications } from '../lib/data/notifications'
import { useAuthStore } from '../stores/auth-store'
import crest from '../assets/crest-sm.png'
import { cn } from '../lib/utils'

/** Same four destinations and order as the phone tab bar. */
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

const LINKS = [
  { to: '/home', label: 'Home' },
  { to: '/services', label: 'Book' },
  { to: '/booking/history', label: 'My bookings' },
  { to: '/settings', label: 'Account' },
] as const

export function TopNav() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { data: notifications } = useQuery({ queryKey: ['notifications'], queryFn: fetchNotifications, enabled: !!user })
  const unread = (notifications ?? []).filter((n) => !n.read).length

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper text-navy">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <Link to="/home" className={cn('flex min-h-10 items-center rounded-lg font-display text-title font-semibold text-navy', FOCUS)}>
          <img src={crest} alt="" aria-hidden="true" className="mr-3 h-9 w-auto" />
          SakramentoHub
        </Link>
        {!user ? (
          <>
            <div className="flex-1" />
            <Link to="/login" className={cn('flex min-h-11 items-center rounded-xl border border-navy px-4 text-body font-semibold text-navy hover:bg-line/40', FOCUS)}>Sign in</Link>
          </>
        ) : (
          <>
        <nav aria-label="Main" className="flex h-14 flex-1 items-center justify-end gap-1">
          {LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex h-14 min-h-10 items-center px-4 text-body font-medium text-ink-muted hover:bg-line/40 hover:text-navy',
                  FOCUS,
                  isActive && 'font-semibold text-navy shadow-[inset_0_-3px_0_var(--navy)]',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <Link to="/notifications" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'} className={cn('relative flex size-10 items-center justify-center rounded-full text-navy hover:bg-line/40', FOCUS)}>
          <Bell size={20} aria-hidden="true" />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-label font-semibold leading-5 text-white">{unread}</span>}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger className={cn('flex min-h-10 max-w-52 items-center gap-2 rounded-full border border-input-border px-3 text-body font-medium text-navy hover:bg-line/40', FOCUS)}>
            <span className="truncate">{user.fullName}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{user.fullName}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/settings/profile')}>Profile</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/wallet')}>Documents</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/settings')}>Settings</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/help')}>Help</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={async () => { await logout(); navigate('/login') }}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
          </>
        )}
      </div>
    </header>
  )
}
