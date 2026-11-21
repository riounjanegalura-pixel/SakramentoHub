import { EmptyState } from '../../components/shared/EmptyState'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Search } from 'lucide-react'
import * as m from 'motion/react-m'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { LoadError } from '../../components/shared/LoadError'
import { ListPager } from '../../components/shared/ListPager'
import { Skeleton } from '../../components/shared/Skeleton'
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue'
import { useTenPerPage } from '../../lib/hooks/useTenPerPage'
import { fadeUp, staggerDelay } from '../../lib/motion'
import { useAuthStore } from '../../stores/auth-store'
import { activateUser, fetchUsers } from '../../lib/data/users'
import type { Role, User } from '../../lib/types'
import { BTN_PRIMARY, REG_INPUT } from '../register/registerForm'
import { Avatar } from '../audit-log/Avatar'
import { DeactivateUserDialog, NewUserDialog } from './UserDialogs'

const ROW_BTN =
  'inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-input-border bg-surface px-4 text-[14px] font-semibold text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:border-line disabled:text-ink-muted disabled:opacity-70 sm:w-[150px]'

function UserList({ role, search, canAct, onDeactivate, onActivate, activating, title, countLabel }: {
  role: Role
  search: string
  canAct: boolean
  onDeactivate: (u: User) => void
  onActivate: (id: string) => void
  activating: boolean
  title: string
  countLabel?: (total: number) => string
}) {
  const [page, setPage] = useState(1)
  const [lastSearch, setLastSearch] = useState(search)
  if (lastSearch !== search) {
    setLastSearch(search)
    setPage(1)
  }
  const { data, isLoading, isError, error, refetch } = useTenPerPage<User>({
    queryKey: ['admin-users', role, search],
    page,
    serverSize: 15,
    fetchPage: (p) => fetchUsers({ role, search, page: p }),
  })
  const rows = data?.rows ?? []
  const activeAdmins = role === 'admin' ? rows.filter((u) => u.isActive).length : 0
  const lastAdmin = (u: User) => role === 'admin' && u.isActive && activeAdmins <= 1

  return (
    <section aria-label={title} className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-[18px] md:px-6">
        <h2 className="font-display text-[22px] font-semibold text-navy">{title}</h2>
        {data && countLabel && <p className="text-[14px] text-ink-muted">{countLabel(data.total)}</p>}
      </div>
      {isLoading && (
        <div aria-busy="true">
          <p role="status" className="sr-only">Loading users</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex min-h-16 items-center gap-3.5 border-t border-line px-4 py-2.5 md:px-6">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1"><Skeleton className="h-4 w-1/3" /><Skeleton className="mt-2 h-3 w-1/2" /></div>
            </div>
          ))}
        </div>
      )}
      {isError && <div className="border-t border-line p-4"><LoadError title="Users didn’t load" message="Check your connection, then try again." detail={(error as Error).message} onRetry={() => void refetch()} /></div>}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState
          className="border-t border-line pb-12 pt-10"
          icon={Users}
          title={search ? 'No users match' : 'No users yet.'}
          hint={search ? 'Try another name or email.' : 'Staff accounts you add appear here.'}
        />
      )}
      {rows.length > 0 && (
        <ul aria-label={`${title} list`}>
          {rows.map((u, i) => (
            <m.li
              key={u.id}
              variants={fadeUp}
              initial="initial"
              animate={{ ...fadeUp.animate, transition: { ...(fadeUp.animate as { transition: object }).transition, delay: staggerDelay(i) } }}
              className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-line px-4 py-2.5 sm:flex-nowrap md:px-6"
            >
              <Avatar name={u.fullName} size={role === 'admin' ? 40 : 36} />
              <div className="min-w-0 flex-1 basis-40">
                <p className="break-words text-[15px] font-semibold text-ink">{u.fullName}</p>
                <p className="break-all text-[13px] text-ink-muted">{u.email}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 text-[14px] ${u.isActive ? 'text-ink' : 'text-danger'}`}>
                <span aria-hidden="true" className={`size-2 rounded-full ${u.isActive ? 'bg-status-done-fg' : 'bg-danger'}`} />
                {u.isActive ? 'Active' : 'Deactivated'}
              </span>
              <div className="flex w-full shrink-0 flex-col gap-1 sm:w-auto">
                {u.isActive ? (
                  <button type="button" disabled={lastAdmin(u) || !canAct} aria-label={`Deactivate ${u.fullName}`} onClick={() => onDeactivate(u)} className={ROW_BTN}>Deactivate</button>
                ) : (
                  <button type="button" disabled={activating || !canAct} aria-label={`Reactivate ${u.fullName}`} onClick={() => onActivate(u.id)} className={ROW_BTN}>Reactivate</button>
                )}
                {lastAdmin(u) && <span className="text-center text-[12px] text-ink-muted">Only remaining admin</span>}
              </div>
            </m.li>
          ))}
        </ul>
      )}
      {data && <ListPager page={page} pageCount={data.pageCount} total={data.total} onPage={setPage} className="border-t border-line px-4 py-3 md:px-6" />}
    </section>
  )
}

/** Users, admin only (server-side `role:admin`). Admins first (few, and the ones to guard), then parishioners, 10 a page.
 * A deactivation the server refuses (the last active admin) is shown inside the dialog. */
export function StaffUsersScreen() {
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [creating, setCreating] = useState(false)
  const [deactivating, setDeactivating] = useState<User | null>(null)

  const activateMutation = useMutation({
    mutationFn: activateUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  const common = { search: debounced.trim(), canAct: true, onDeactivate: setDeactivating, onActivate: activateMutation.mutate, activating: activateMutation.isPending }

  return (
    <AdminLayout title="Users">
      <div className="flex w-full max-w-[1760px] flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-[640px] text-[14px] text-ink-muted">
            Admins run the parish office in this app. Deactivating an account signs the person out and keeps their history.
          </p>
          <button type="button" onClick={() => setCreating(true)} className={`${BTN_PRIMARY} inline-flex items-center justify-center gap-2 max-md:w-full`}>
            <Plus size={18} aria-hidden="true" />
            New user
          </button>
        </div>

        <label className="relative flex max-w-[420px] flex-col gap-1 text-[14px] font-medium text-ink">
          Search users
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute bottom-[16px] left-3.5 text-ink-muted" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" className={`${REG_INPUT} pl-10`} />
        </label>

        <UserList {...common} role="admin" title="Admins" />
        <UserList {...common} role="parishioner" title="Parishioners" countLabel={(n) => n.toLocaleString('en-PH')} />

        {currentUser?.role !== 'admin' && <p className="text-label text-ink-muted">Only an admin account can manage users.</p>}
      </div>

      {creating && (
        <NewUserDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            refresh()
          }}
        />
      )}
      {deactivating && (
        <DeactivateUserDialog
          user={deactivating}
          onClose={() => setDeactivating(null)}
          onDone={() => {
            setDeactivating(null)
            refresh()
          }}
        />
      )}
    </AdminLayout>
  )
}
