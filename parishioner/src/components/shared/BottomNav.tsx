import { Link, useLocation } from 'react-router-dom'
import { CalendarPlus, ClipboardList, Home, UserRound } from 'lucide-react'

interface Tab {
  to: string
  label: string
  icon: typeof Home
  /** Pages that belong to this tab although they live at another path. */
  also: readonly string[]
}

const TABS: readonly Tab[] = [
  { to: '/home', label: 'Home', icon: Home, also: ['/calendar', '/events', '/notifications'] },
  { to: '/services', label: 'Book', icon: CalendarPlus, also: ['/certificates'] },
  { to: '/booking/history', label: 'My bookings', icon: ClipboardList, also: ['/wallet'] },
  { to: '/settings', label: 'Account', icon: UserRound, also: ['/help', '/about', '/privacy'] },
]

/**
 * Docked tab bar: solid, full width, safe-area padding, labels always visible at 14 px.
 * Labels are 14 px but capped at 4.2vw, so at 200% text all four still fit on a 360 px phone.
 * The active tab is marked by a navy icon and label, bold text and a 3 px navy rule on top, never by colour alone.
 */
export function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-[480px] items-stretch">
        {TABS.map(({ to, label, icon: Icon, also }) => {
          const active = [to, ...also].some((p) => pathname === p || pathname.startsWith(`${p}/`))
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-16 min-w-11 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[length:min(var(--fs-label),max(14px,4.2vw))] leading-tight focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${
                active ? 'font-semibold text-navy' : 'font-medium text-ink-muted'
              }`}
            >
              {active && <span data-testid="tab-rule" aria-hidden="true" className="absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-navy" />}
              <Icon size={24} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
