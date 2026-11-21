import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth-store'
import { useExportMyData } from '../features/settings/accountActions'
import { Button } from '../components/ui/button'

/** The Account page of Settings on a desktop: who is signed in, and the account actions. */
export function WebAccountPane() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const exportMutation = useExportMyData()
  const [showPasswordUpdated] = useState(
    () => (location.state as { passwordUpdated?: boolean } | null)?.passwordUpdated ?? false,
  )

  // Show the notice once, then clear it from the address so a refresh does not repeat it.
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
    <div className="flex flex-col gap-6">
      {showPasswordUpdated && (
        <p role="status" className="rounded-xl bg-status-done-bg px-4 py-3 text-sm font-semibold text-status-done-fg">
          Password updated
        </p>
      )}

      <section aria-labelledby="account-signed-in" className="rounded-2xl border border-line bg-surface p-6">
        <h2 id="account-signed-in" className="text-label font-semibold text-ink-muted">Signed in as</h2>
        <p className="mt-1 font-semibold text-ink">{user?.fullName}</p>
        <p className="text-sm text-ink-muted">{user?.email}</p>
      </section>


      <section aria-labelledby="account-data" className="rounded-2xl border border-line bg-surface p-6">
        <h2 id="account-data" className="font-semibold text-ink">Your data</h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {exportMutation.isPending ? 'Preparing your download…' : 'Download a copy of your account data'}
          </p>
          <Button type="button" variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
            Export my data
          </Button>
        </div>
        {exportMutation.isError && (
          <p className="mt-3 text-sm font-medium text-danger" role="alert">{(exportMutation.error as Error).message}</p>
        )}
      </section>

      <section aria-labelledby="account-session" className="rounded-2xl border border-line bg-surface p-6">
        <h2 id="account-session" className="font-semibold text-ink">Session</h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">You can sign in again at any time.</p>
          <Button type="button" variant="outline" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </section>

      {/* Last, apart and in the danger colour: the delete itself is confirmed on its own page. */}
      <section aria-labelledby="account-delete" className="rounded-2xl border border-danger bg-surface p-6">
        <h2 id="account-delete" className="font-semibold text-danger">Delete account</h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm text-ink-muted">
            Permanently delete your account and personal information. You will be asked to confirm.
          </p>
          <Button asChild variant="outline" className="border-danger text-danger hover:bg-status-rejected-bg">
            <Link to="/settings/delete-account">Delete my account</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
