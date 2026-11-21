import { ChevronRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Emblem } from '../../components/shared/Emblem'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { SACRAMENTS, SACRAMENT_LABEL } from '../../lib/domain'
import { useAuthStore } from '../../stores/auth-store'
import { useBookingStore } from '../../stores/booking-store'
import { useDeskStore } from '../../stores/desk-store'
import { useServerErrorsStore } from '../../stores/server-errors-store'
import type { Sacrament } from '../../lib/types'

export function DeskHomeScreen() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const startBooking = useBookingStore((s) => s.startBooking)

  const begin = (sacrament: Sacrament) => {
    startBooking(sacrament)
    useDeskStore.getState().reset()
    useServerErrorsStore.getState().clear()
    navigate(`/desk/${sacrament}/1`)
  }

  return (
    <AppShell
      showBottomNav={false}
      header={
        <AppHeader
          title="Office desk"
          subtitle={user ? `Signed in as ${user.fullName}` : undefined}
          action={
            <button
              type="button"
              onClick={async () => {
                await logout()
                navigate('/login')
              }}
              className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold text-white"
            >
              Sign out
            </button>
          }
        />
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 className="font-display text-heading font-semibold text-navy">New walk-in booking</h2>
        <p className="text-sm text-ink-muted">
          Pick what the person is booking. You enter their contact first, then the same questions parishioners answer online.
        </p>
        {SACRAMENTS.map((sacrament) => (
          <button
            key={sacrament}
            type="button"
            onClick={() => begin(sacrament)}
            className="flex min-h-[4.5rem] items-center gap-4 border-b border-line px-1 py-3 text-left text-body font-semibold text-ink hover:bg-line/30"
          >
            <Emblem kind={sacrament} size="xs" />
            <span className="flex-1">{SACRAMENT_LABEL[sacrament]}</span>
            <ChevronRight size={18} className="text-ink-muted" aria-hidden="true" />
          </button>
        ))}
        <Link to="/home" className="mt-2 text-center text-sm font-semibold text-navy">
          Use the parishioner app instead
        </Link>
      </div>
    </AppShell>
  )
}
