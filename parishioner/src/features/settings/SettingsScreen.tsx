import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { User, Bell, Lock, Info, HelpCircle, ChevronRight, ShieldCheck, Download, UserX, FileText, type LucideProps } from 'lucide-react'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { NotificationsLink } from '../../components/shared/NotificationsLink'
import { Button } from '../../components/ui/button'
import { useAuthStore } from '../../stores/auth-store'
import { cn } from '../../lib/utils'
import { useExportMyData } from './accountActions'

type Icon = ComponentType<LucideProps>

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

interface Row {
  to: string
  icon: Icon
  title: string
  description: string
}

// Rows are grouped under headings so the list reads as a few small sections instead of ten equal cards.
const ACCOUNT: readonly Row[] = [
  { to: '/settings/profile', icon: User, title: 'Profile Info', description: 'Manage your personal details' },
  { to: '/settings/notifications', icon: Bell, title: 'Notifications', description: 'Manage push notification' },
  { to: '/settings/change-password', icon: Lock, title: 'Change Password', description: 'Update your account password' },
]

// My bookings is a tab of its own now, so it is not listed twice here.
const RECORDS: readonly Row[] = [
  { to: '/wallet', icon: FileText, title: 'Documents and certificates', description: 'Documents and certificates you keep' },
]

const ABOUT: readonly Row[] = [
  { to: '/privacy', icon: ShieldCheck, title: 'Privacy Notice', description: 'How your data is collected and used' },
  { to: '/about', icon: Info, title: 'About SakramentoHub', description: 'Learn more about the app' },
  { to: '/help', icon: HelpCircle, title: 'Help / FAQs', description: 'Get answers to common questions' },
]

const ROW = cn('flex min-h-16 w-full items-center gap-3 px-1 py-3 text-left hover:bg-line/30', FOCUS)

/** A plain navy outline icon beside the label, no chip. */
function Chip({ icon: Icon }: { icon: Icon }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center text-navy">
      <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
    </span>
  )
}

function RowText({ title, description }: { title: string; description: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-body font-semibold text-ink">{title}</span>
      <span className="block text-note text-ink-muted">{description}</span>
    </span>
  )
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-1 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">
        {title}
      </h2>
      {children}
    </section>
  )
}

function LinkRows({ rows }: { rows: readonly Row[] }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {rows.map(({ to, icon, title, description }) => (
        <li key={to}>
          <Link to={to} className={ROW}>
            <Chip icon={icon} />
            <RowText title={title} description={description} />
            <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function SettingsScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showPasswordUpdated] = useState(
    () => (location.state as { passwordUpdated?: boolean } | null)?.passwordUpdated ?? false,
  )
  const logout = useAuthStore((s) => s.logout)

  const exportMutation = useExportMyData()

  useEffect(() => {
    if ((location.state as { passwordUpdated?: boolean } | null)?.passwordUpdated) {
      navigate('.', { replace: true, state: {} })
    }
  }, [location.state, navigate])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <AppShell header={<AppHeader title="Account" action={<NotificationsLink />} />}>
      <div className="flex flex-col gap-6 px-4 py-4">

        {showPasswordUpdated && (
          <p role="status" className="rounded-xl bg-status-done-bg px-4 py-3 text-body font-semibold text-status-done-fg">
            Password updated
          </p>
        )}

        <Group id="settings-account" title="Your profile">
          <LinkRows rows={ACCOUNT} />
          <Button type="button" variant="outline" onClick={handleLogout} size="lg" className="mt-3 w-full">
            Sign out
          </Button>
        </Group>

        <Group id="settings-records" title="Records">
          <LinkRows rows={RECORDS} />
        </Group>

        <Group id="settings-about" title="About the app">
          <LinkRows rows={ABOUT} />
        </Group>

        <Group id="settings-data" title="Your data">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <button
              type="button"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              className={cn(ROW, 'disabled:opacity-60')}
            >
              <Chip icon={Download} />
              <RowText
                title="Export My Data"
                description={exportMutation.isPending ? 'Preparing your download…' : 'Download a copy of your account data'}
              />
              <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
            </button>
          </div>
          {exportMutation.isError && (
            <p role="alert" className="mt-2 text-sm font-medium text-danger">
              {(exportMutation.error as Error).message}
            </p>
          )}
        </Group>

        {/* Last, set apart and in the danger colour: the one action that cannot be undone. */}
        <Group id="settings-delete" title="Delete account">
          <Link
            to="/settings/delete-account"
            className={cn(ROW, 'rounded-2xl border border-danger bg-surface')}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-status-rejected-bg text-status-rejected-fg">
              <UserX size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-danger">Delete My Account</span>
              <span className="block text-sm text-ink-muted">Permanently delete your account and data</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
          </Link>
        </Group>
      </div>
    </AppShell>
  )
}
