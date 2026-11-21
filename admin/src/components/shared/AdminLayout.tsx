import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, Outlet, ScrollRestoration, useNavigate } from 'react-router-dom'
import { BookMarked, CalendarDays, Plus, ChevronRight, ClipboardList, FileCheck, BarChart3, Menu, LayoutDashboard, History, SlidersHorizontal, Users, LogOut } from 'lucide-react'
import crest from '../../assets/crest-sm.png'
import { useAuthStore } from '../../stores/auth-store'
import { useIsPhone } from '../../lib/hooks/useIsPhone'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
import { NotificationBell } from './NotificationBell'
import { fetchAnalytics } from '../../lib/data/analytics'
import type { AttentionCounts } from '../../lib/types'

// Sidebar destinations, grouped by how staff work: today's desk, the records,
// the parish calendar and reports, then administration. Parish events is
// reachable by both `staff` and `admin` (server-side `role:staff,admin`, same
// level as Bookings — see docs/api-contract.md), so it sits in the shared groups.
type NavItem = { to: string; label: string; icon: typeof ClipboardList; count?: keyof AttentionCounts }

// Dashboard stands alone; Schedule is no longer a tab (the Dashboard carries the month calendar and day timeline).
const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  { label: '', items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  { label: 'Records', items: [
    { to: '/bookings', label: 'Bookings', icon: ClipboardList, count: 'awaitingReview' },
    { to: '/register', label: 'Register', icon: BookMarked },
    { to: '/certificate-requests', label: 'Certificate requests', icon: FileCheck, count: 'certificateRequests' },
  ] },
  { label: 'Parish', items: [
    { to: '/parish-events', label: 'Parish events', icon: CalendarDays },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
  ] },
  { label: 'Administration', items: [
    { to: '/settings', label: 'Settings', icon: SlidersHorizontal },
    { to: '/audit-log', label: 'Audit log', icon: History },
  ] },
]

// Staff & Users management is admin-only server-side (`role:admin`, not
// `role:staff,admin` — see docs/api-contract.md's reasoning). Hidden from a
// `staff` viewer's nav entirely rather than shown-then-403'd, though the
// route itself is still reachable (and honestly surfaces the backend's own
// 403) if a staff member navigates to it directly.
const ADMIN_ONLY_NAV_ITEM: NavItem = { to: '/users', label: 'Users', icon: Users }

/** The phone bottom bar: Dashboard, Queue, More. Everything else is in the More sheet. */
const PHONE_TABS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/bookings', label: 'Queue', icon: ClipboardList, count: 'awaitingReview' },
]

const NAV_FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
const NAV_FOCUS_ON_NAVY = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

/** Counts that need action, from the same request the Dashboard uses. Zero shows nothing. */
function useNavCounts(): Partial<AttentionCounts> {
  const { data } = useQuery({ queryKey: ['admin-analytics'], queryFn: fetchAnalytics })
  return data?.attention ?? {}
}

function SideLink({ to, label, icon: Icon, count, onNavigate }: Omit<NavItem, 'count'> & { count?: number; onNavigate?: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex min-h-11 shrink-0 items-center gap-3 rounded-[10px] px-3 text-body text-white lg:min-h-10 ${NAV_FOCUS_ON_NAVY} ${
          isActive ? 'bg-white/16 font-semibold' : 'font-medium hover:bg-white/10'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span data-testid="nav-active" aria-hidden="true" className="sr-only" />}
          <Icon size={20} aria-hidden="true" className="shrink-0" />
          <span className="flex-1">{label}</span>
          {count ? <span className="text-label tabular-nums text-white/90">{count}</span> : null}
        </>
      )}
    </NavLink>
  )
}

const WALKIN_ON_NAVY = `bg-surface text-navy ${NAV_FOCUS_ON_NAVY}`
const WALKIN_ON_PAPER = `bg-navy text-white ${NAV_FOCUS}`

/** Opens the office's walk-in booking, inside this app. Staff and admin only. */
function WalkInLink({ onNavy = false, className = '' }: { onNavy?: boolean; className?: string }) {
  const role = useAuthStore((s) => s.user?.role)
  if (role !== 'staff' && role !== 'admin') return null
  return (
    <Link
      to="/walk-in"
      className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-body font-semibold ${onNavy ? WALKIN_ON_NAVY : WALKIN_ON_PAPER} ${className}`}
    >
      <Plus size={18} aria-hidden="true" />
      New walk-in booking
    </Link>
  )
}

/**
 * The admin shell: a navy sidebar (walk-in button, Dashboard, then Records, Parish and Administration), a paper top
 * bar with the title and the bell, and the content. Below 768 px the sidebar gives way to a bottom bar of Dashboard,
 * Queue and More; More opens every page as grouped rows.
 */
function Frame({ title, actions, children, titleRef, actionsRef }: {
  title?: string
  actions?: ReactNode
  children: ReactNode
  titleRef?: (el: HTMLElement | null) => void
  actionsRef?: (el: HTMLElement | null) => void
}) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const phone = useIsPhone()
  const [more, setMore] = useState(false)
  const counts = useNavCounts()
  // A focused control scrolls into view clear of the bottom bar.
  useEffect(() => {
    if (!phone) return
    document.documentElement.style.scrollPaddingBottom = '6rem'
    return () => {
      document.documentElement.style.scrollPaddingBottom = ''
    }
  }, [phone])
  const groups = NAV_GROUPS.map((g) => (g.label === 'Administration' && user?.role === 'admin' ? { ...g, items: [...g.items, ADMIN_ONLY_NAV_ITEM] } : g))

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const groupList = (onNavigate?: () => void) =>
    groups.map((g, i) => (
      <div key={g.label || i} role="group" aria-label={g.label || 'Dashboard'} className="flex flex-col gap-0.5">
        {g.label && <p aria-hidden="true" className="px-3 pb-1.5 text-label font-medium text-white/80">{g.label}</p>}
        {g.items.map((item) => (
          <SideLink key={item.to} to={item.to} label={item.label} icon={item.icon} count={item.count ? counts[item.count] : undefined} onNavigate={onNavigate} />
        ))}
      </div>
    ))

  return (
    <div className="flex min-h-screen flex-col bg-paper md:flex-row print:block print:bg-surface">
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-surface focus-visible:px-4 focus-visible:py-2 focus-visible:text-body focus-visible:font-semibold focus-visible:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus print:hidden"
      >
        Skip to main content
      </a>
      <aside className="hidden w-full shrink-0 flex-col justify-between bg-navy px-3 pb-4 pt-6 text-white md:sticky md:top-0 md:flex md:h-screen md:w-66 md:overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden print:hidden">
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2.5 px-1.5">
            <div className="flex rounded-[10px] bg-surface px-[7px] py-[5px]">
              <img src={crest} alt="" aria-hidden="true" className="h-[34px] w-7 object-contain" />
            </div>
            <div className="min-w-0">
              <p className="whitespace-nowrap font-display text-[1.125rem] font-semibold leading-tight">SakramentoHub</p>
              <p className="text-label text-white/80">Admin portal</p>
            </div>
          </div>
          <WalkInLink onNavy />
          <nav aria-label="Main" className="flex flex-col gap-4">
            {groupList()}
          </nav>
        </div>
        <div className="flex flex-col gap-2 border-t border-white/20 px-2 pt-3.5">
          {user && (
            <p className="text-label text-white/90" title={user.email}>
              {user.fullName} <span className="text-white/80">&middot; {user.role}</span>
            </p>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className={`-mx-1 flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-1 text-body font-medium text-white hover:bg-white/10 ${NAV_FOCUS_ON_NAVY}`}
          >
            <LogOut size={18} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-paper px-4 py-3 md:px-8 print:hidden">
          <h1 ref={titleRef} className="min-w-0 font-display text-title font-semibold text-navy [overflow-wrap:anywhere]">{title}</h1>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div ref={actionsRef} className="flex items-center gap-2 sm:gap-3 empty:hidden">{actions}</div>
            <NotificationBell />
          </div>
        </header>
        <main id="main" tabIndex={-1} className={`min-w-0 flex-1 overflow-x-clip px-4 pb-4 pt-1 outline-none md:px-8 md:pb-8 md:pt-1 print:p-0 ${phone ? 'pb-24' : ''}`}>
          {children}
        </main>
      </div>

      {phone && (
        <>
          <nav aria-label="Phone tasks" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] print:hidden">
            <div className="flex items-stretch">
              {PHONE_TABS.map(({ to, label, icon: Icon, count }) => {
                const badge = count ? counts[count] : 0
                return (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-label leading-tight ${NAV_FOCUS} ${isActive ? 'font-semibold text-navy' : 'font-medium text-ink-muted'}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span aria-hidden="true" className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-navy" />}
                        <span className="relative flex">
                          <Icon size={24} aria-hidden="true" />
                          {badge ? (
                            <span className="absolute -right-3 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-label font-semibold text-white">
                              <span className="sr-only">{badge} waiting</span>
                              <span aria-hidden="true">{badge}</span>
                            </span>
                          ) : null}
                        </span>
                        <span>{label}</span>
                      </>
                    )}
                  </NavLink>
                )
              })}
              <button
                type="button"
                onClick={() => setMore(true)}
                className={`flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-label font-medium leading-tight text-ink-muted ${NAV_FOCUS}`}
              >
                <Menu size={24} aria-hidden="true" />
                <span>More</span>
              </button>
            </div>
          </nav>
          <Sheet open={more} onOpenChange={setMore}>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-[20px] bg-paper">
              <SheetHeader>
                <SheetTitle>All pages</SheetTitle>
                <SheetDescription className="sr-only">Everything in the admin portal.</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4 pb-7">
                <nav aria-label="All pages" className="flex flex-col gap-3.5">
                  <WalkInLink className="min-h-[52px]" />
                  {groups.map((g, i) => (
                    <div key={g.label || i} role="group" aria-label={g.label || 'Dashboard'} className="overflow-hidden rounded-2xl border border-line bg-surface">
                      {g.items.map((item) => {
                        const n = item.count ? counts[item.count] : 0
                        const Icon = item.icon
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setMore(false)}
                            className={`flex min-h-[52px] items-center gap-3.5 border-t border-line px-4 text-body text-ink first:border-t-0 ${NAV_FOCUS}`}
                          >
                            <Icon size={22} aria-hidden="true" className="shrink-0 text-navy" />
                            <span className="flex-1">{item.label}</span>
                            {n ? <span className="text-body font-semibold tabular-nums text-navy">{n}</span> : null}
                            <ChevronRight size={18} aria-hidden="true" className="text-ink-muted" />
                          </Link>
                        )
                      })}
                    </div>
                  ))}
                </nav>
                <button
                  type="button"
                  onClick={handleLogout}
                  className={`flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl border border-input-border bg-surface text-body font-semibold text-navy ${NAV_FOCUS}`}
                >
                  <LogOut size={20} aria-hidden="true" />
                  Sign out
                </button>
                {user && <p className="text-center text-label text-ink-muted">{user.fullName} &middot; {user.role}</p>}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  )
}

type Slots = { title: HTMLElement | null; actions: HTMLElement | null }
const SlotsContext = createContext<Slots | null>(null)

/**
 * The one admin frame, mounted once as the parent route: the sidebar, top bar and bell stay put while only the page
 * inside changes. Each screen still renders <AdminLayout title actions>; inside the shell that hands its title and
 * buttons to the top bar and renders just its content.
 */
export function AdminShell() {
  const [title, setTitle] = useState<HTMLElement | null>(null)
  const [actions, setActions] = useState<HTMLElement | null>(null)
  return (
    <SlotsContext.Provider value={{ title, actions }}>
      <Frame titleRef={setTitle} actionsRef={setActions}>
        <Outlet />
      </Frame>
      <ScrollRestoration />
    </SlotsContext.Provider>
  )
}

/** A screen's page: inside AdminShell it fills the top bar and shows its content; on its own it draws the whole frame. */
export function AdminLayout({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const slots = useContext(SlotsContext)
  useEffect(() => {
    if (slots) document.title = `${title} · SakramentoHub`
  }, [slots, title])
  if (!slots) return <Frame title={title} actions={actions}>{children}</Frame>
  return (
    <>
      {slots.title && createPortal(title, slots.title)}
      {slots.actions && actions ? createPortal(actions, slots.actions) : null}
      {children}
    </>
  )
}
