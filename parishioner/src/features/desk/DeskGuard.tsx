import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { useApi as liveServer } from '../../lib/data/useApi'
import { isStaffSide } from '../../lib/roles'
import { useAuthStore } from '../../stores/auth-store'

/** Wrap an office-desk screen: needs the live server, and a staff or admin account. Sits inside ProtectedRoute. */
export function DeskGuard({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)

  if (!liveServer) {
    return (
      <AppShell showBottomNav={false} header={<AppHeader title="Office desk" />}>
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <p className="font-semibold text-ink">The office desk is not available in demo mode.</p>
          <p className="text-sm text-ink-muted">Walk-in booking needs the live parish server.</p>
          <Link to="/home" className="inline-flex min-h-11 items-center font-semibold text-navy underline underline-offset-4">Back to Home</Link>
        </div>
      </AppShell>
    )
  }
  if (!isStaffSide(user)) return <Navigate to="/home" replace />
  return <>{children}</>
}
