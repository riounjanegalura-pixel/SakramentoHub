import { useEffect, useState, type ReactNode } from 'react'
import * as m from 'motion/react-m'
import { durations, ease } from '../lib/motion'
import { NavLink } from 'react-router-dom'
import { WebFrame } from './WebFrame'
import { WebPaneContext } from './WebPane'
import { cn } from '../lib/utils'

const SUB_MENU = [
  { to: '/settings', label: 'Account' },
  { to: '/settings/profile', label: 'Profile' },
  { to: '/settings/notifications', label: 'Notifications' },
  { to: '/settings/change-password', label: 'Change password' },
  { to: '/about', label: 'About' },
  { to: '/help', label: 'Help' },
  { to: '/settings/delete-account', label: 'Delete account' },
] as const

/** The destructive page sits last, apart from the rest, in the danger colour. */
const DANGER = '/settings/delete-account'

let firstPaneShown = false

/** The content pane fades in when you switch pages; the first one on load, the menu and the frame never do. */
function Pane({ children }: { children: ReactNode }) {
  const [animate] = useState(() => firstPaneShown)
  useEffect(() => {
    firstPaneShown = true
  }, [])
  return (
    <m.div initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: durations.quick, ease: [...ease] }}>
      {children}
    </m.div>
  )
}

/** Settings on a desktop: a sub-menu on the left and one content pane on the right. */
export function WebSettings({ children }: { children: ReactNode }) {
  return (
    <WebFrame width="max-w-6xl">
      <h1 className="mb-5 font-display text-title font-semibold text-navy">Settings</h1>
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings" className="self-start">
          <ul className="flex flex-col gap-1">
            {SUB_MENU.map(({ to, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/settings'}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 items-center rounded-xl px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                      to === DANGER ? 'mt-4 border-t border-line text-danger' : 'text-ink-muted hover:bg-surface',
                      isActive ? 'border border-line bg-surface font-semibold' : 'border border-transparent',
                      isActive && to !== DANGER && 'text-ink',
                    )
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <section aria-label="Settings content" className="min-w-0">
          <Pane><WebPaneContext.Provider value>{children}</WebPaneContext.Provider></Pane>
        </section>
      </div>
    </WebFrame>
  )
}
