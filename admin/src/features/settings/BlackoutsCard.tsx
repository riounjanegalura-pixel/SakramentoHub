import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck } from 'lucide-react'
import * as m from 'motion/react-m'
import { AnimatePresence } from 'motion/react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { BTN_DANGER, BTN_OUTLINE, BTN_PRIMARY, REG_DIALOG_NARROW } from '../register/registerForm'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { LoadError } from '../../components/shared/LoadError'
import { ListPager } from '../../components/shared/ListPager'
import { Skeleton } from '../../components/shared/Skeleton'
import { createBlackouts, deleteBlackout, fetchBlackouts } from '../../lib/data/settings'
import { formatDate, formatTime } from '../../lib/domain'
import { fadeUp, staggerDelay } from '../../lib/motion'
import type { AdminService, BlackoutResult, Sacrament } from '../../lib/types'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
const FOCUS_WITHIN = 'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus rounded-lg'
const CARD ='rounded-2xl border border-line bg-surface p-5 md:p-6'
const H2 = 'font-display text-heading font-semibold text-navy'
const PAGE = 10
const HATCH = 'repeating-linear-gradient(135deg, rgb(163 38 28 / .45) 0 1.5px, transparent 1.5px 6px)'

const ymd = (y: number, mo: number, d: number) => `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** A month of days with the closed ones hatched and named on hover. Closed dates come from the list below it. */
function ClosureCalendar({ closed }: { closed: Map<string, string> }) {
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), mo: now.getMonth() })
  const today = ymd(now.getFullYear(), now.getMonth(), now.getDate())
  const first = new Date(cursor.y, cursor.mo, 1)
  const days = new Date(cursor.y, cursor.mo + 1, 0).getDate()
  const cells = [...Array.from({ length: first.getDay() }, () => 0), ...Array.from({ length: days }, (_, i) => i + 1)]
  const step = (by: number) => setCursor((c) => { const d = new Date(c.y, c.mo + by, 1); return { y: d.getFullYear(), mo: d.getMonth() } })
  const btn = `flex size-11 items-center justify-center rounded-xl border border-line text-navy ${FOCUS}`
  return (
    <section aria-label="Calendar of closures" className={CARD}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={H2}>{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
        <div className="flex gap-2">
          <button type="button" aria-label="Previous month" onClick={() => step(-1)} className={btn}><ChevronLeft size={20} aria-hidden="true" /></button>
          <button type="button" aria-label="Next month" onClick={() => step(1)} className={btn}><ChevronRight size={20} aria-hidden="true" /></button>
        </div>
      </div>
      <div aria-hidden="true" className="grid grid-cols-7 gap-1 text-center text-[12px] font-semibold text-ink-muted">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((n, i) => {
          if (!n) return <span key={`b${i}`} />
          const key = ymd(cursor.y, cursor.mo, n)
          const reason = closed.get(key)
          const past = key < today
          return (
            <span
              key={key}
              title={reason}
              aria-label={reason ? `${formatDate(key)}, closed: ${reason}` : undefined}
              style={reason && !past ? { backgroundImage: HATCH } : undefined}
              className={`flex aspect-square items-center justify-center rounded-lg text-[14px] tabular-nums ${key === today ? 'border-2 border-navy' : 'border-2 border-transparent'} ${past ? 'bg-paper-deep text-ink-muted' : reason ? 'bg-status-rejected-bg font-semibold text-ink' : 'text-ink'}`}
            >
              {n}
            </span>
          )
        })}
      </div>
      <ul aria-label="Key" className="mt-3 flex gap-5 text-[13px] text-ink-muted">
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3.5 rounded bg-status-rejected-bg" style={{ backgroundImage: HATCH }} />Closed</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3.5 rounded bg-paper-deep" />Past</li>
      </ul>
    </section>
  )
}

/** Closing a date is daily office work, so staff and admin can both add and remove closures. */
export function BlackoutsCard({ services, triduum }: { services: AdminService[]; triduum: { date: string; reason: string }[] }) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [chosen, setChosen] = useState<Sacrament[]>([])
  // Whole day and every service are the plain defaults; each is a visible switch, never an empty field that means "all".
  const [allServices, setAllServices] = useState(true)
  const [allDay, setAllDay] = useState(true)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [result, setResult] = useState<BlackoutResult | null>(null)
  const [removed, setRemoved] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ id: number; reason: string } | null>(null)
  const [page, setPage] = useState(1)

  const names = new Map(services.map((s) => [s.id, s.name]))
  const list = useQuery({ queryKey: ['admin-blackouts'], queryFn: fetchBlackouts })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-blackouts'] })
    queryClient.invalidateQueries({ queryKey: ['admin-schedule'] })
  }

  const add = useMutation({
    mutationFn: () =>
      createBlackouts({
        date,
        ...(endDate ? { endDate } : {}),
        reason: reason.trim(),
        ...(allDay ? {} : { startTime, endTime }),
        sacraments: allServices ? null : chosen,
      }),
    onSuccess: (res) => {
      setResult(res)
      setRemoved(false)
      setDate('')
      setEndDate('')
      setReason('')
      setChosen([])
      setAllServices(true)
      setAllDay(true)
      setStartTime('')
      setEndTime('')
      refresh()
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteBlackout(id),
    onSuccess: () => {
      setResult(null)
      setRemoved(true)
      setPendingDelete(null)
      refresh()
    },
  })

  const scope = (s: Sacrament[] | null) => (s === null ? 'All services' : s.map((id) => names.get(id) ?? id).join(', '))
  const when = (b: { startTime: string | null; endTime: string | null }) => (b.startTime && b.endTime ? `${formatTime(b.startTime)} to ${formatTime(b.endTime)}` : 'All day')
  const timeError = !allDay && !!startTime && !!endTime && endTime <= startTime ? 'Closing time must be after the opening time.' : null
  const ready =
    !!date && reason.trim().length >= 3 && (allDay || (!!startTime && !!endTime && !timeError)) && (allServices || chosen.length > 0)
  const affected = result?.affectedBookings.length ?? 0
  const all = list.data ?? []
  const pageCount = Math.max(1, Math.ceil(all.length / PAGE))
  const current = Math.min(page, pageCount)
  const shown = all.slice((current - 1) * PAGE, current * PAGE)
  const closed = new Map<string, string>([...triduum.map((t) => [t.date, t.reason] as const), ...all.map((b) => [b.date, b.reason] as const)])

  return (
    <section aria-label="Blackout dates" className="flex flex-col gap-5">
      <p className="max-w-[640px] text-[14px] text-ink-muted">Closing a date applies to new bookings and reschedules. Existing appointments keep their slot.</p>

      <AnimatePresence initial={false}>
        {result && (
          <m.div
            key="result"
            role="status"
            variants={fadeUp}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`rounded-xl p-4 text-sm ${affected > 0 ? 'bg-status-pending-bg text-status-pending-fg' : 'bg-status-done-bg text-status-done-fg'}`}
          >
            {affected === 0 ? (
              <p className="flex items-center gap-1.5">
                <CircleCheck size={16} aria-hidden="true" />
                Closure added.
              </p>
            ) : (
              <>
                <p className="flex items-center gap-1.5 font-semibold">
                  <CircleAlert size={16} aria-hidden="true" />
                  {affected} {affected === 1 ? 'booking already falls' : 'bookings already fall'} on these dates
                </p>
                <p className="mb-2">They keep their slot. Reschedule them or call.</p>
                <ul className="flex flex-col gap-1">
                  {result.affectedBookings.map((b) => (
                    <li key={b.id}>
                      <Link to={`/bookings/${b.id}`} className={`font-medium underline ${FOCUS}`}>
                        {b.referenceNumber} · {b.subjectName} · {formatDate(b.appointmentDate)} at {formatTime(b.appointmentStart)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <button type="button" onClick={() => setResult(null)} className={`mt-2 min-h-11 rounded-lg text-label font-medium underline lg:min-h-8 ${FOCUS}`}>
              Dismiss
            </button>
          </m.div>
        )}
        {removed && !result && (
          <m.p key="removed" role="status" variants={fadeUp} initial="initial" animate="animate" exit="exit" className="flex items-center gap-1.5 rounded-xl bg-status-done-bg p-3 text-sm font-medium text-status-done-fg">
            <CircleCheck size={16} aria-hidden="true" />
            Closure removed.
          </m.p>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 xl:items-start">
        <section aria-label="Add a closure" className={CARD}>
          <h2 className={`${H2} mb-4`}>Close a date</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setResult(null)
              setRemoved(false)
              add.mutate()
            }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <Field id="blackout-from" label="From" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field id="blackout-until" label="Until" description="Optional">
              <Input type="date" min={date || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            <Field id="blackout-reason" label="Reason" required className="sm:col-span-2">
              <Input maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <fieldset role="group" aria-label="Time of day" className="flex flex-col gap-3 sm:col-span-2">
              <legend className="mb-1.5 text-sm font-medium text-ink">Time of day</legend>
              <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] font-medium text-ink ${FOCUS_WITHIN}`}>
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-5 accent-navy" />
                All day
              </label>
              {!allDay && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="blackout-start-time" label="Closed from" required>
                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </Field>
                  <Field id="blackout-end-time" label="Closed until" required>
                    <Input type="time" value={endTime} min={startTime || undefined} onChange={(e) => setEndTime(e.target.value)} />
                  </Field>
                  {timeError && <p role="alert" className="text-sm font-medium text-danger sm:col-span-2">{timeError}</p>}
                  <p className="text-[13px] text-ink-muted sm:col-span-2">Only this part of the day is closed. The rest of the day can still be booked.</p>
                </div>
              )}
            </fieldset>
            <fieldset role="group" aria-label="Applies to" className="flex flex-col gap-3 sm:col-span-2">
              <legend className="mb-1.5 text-sm font-medium text-ink">Applies to</legend>
              <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] font-medium text-ink ${FOCUS_WITHIN}`}>
                <input type="checkbox" checked={allServices} onChange={(e) => setAllServices(e.target.checked)} className="size-5 accent-navy" />
                All services
              </label>
              {!allServices && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {services.map((s) => {
                      const on = chosen.includes(s.id)
                      return (
                        <label
                          key={s.id}
                          className={`relative inline-flex min-h-11 cursor-pointer items-center rounded-xl px-3.5 text-[14px] text-navy has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${on ? 'border-2 border-navy bg-status-confirmed-bg px-[13px] font-semibold' : 'border border-input-border bg-surface font-medium'}`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => setChosen(e.target.checked ? [...chosen, s.id] : chosen.filter((c) => c !== s.id))}
                            className="absolute inset-0 size-full cursor-pointer opacity-0"
                          />
                          {s.name}
                        </label>
                      )
                    })}
                  </div>
                  {chosen.length === 0 && <p className="text-[13px] text-ink-muted">Choose at least one service.</p>}
                </>
              )}
            </fieldset>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={!ready || add.isPending} className={`${ready ? BTN_PRIMARY : BTN_OUTLINE} max-md:w-full`}>
                Add closure
              </button>
              {add.isError && (
                <p role="alert" className="text-sm font-medium text-danger">
                  {(add.error as Error).message}
                </p>
              )}
            </div>
          </form>
        </section>

        <ClosureCalendar closed={closed} />
      </div>

      <section aria-label="Closures" className={CARD}>
        <h2 className={`${H2} mb-2`}>Upcoming closures</h2>
        {list.isLoading && (
          <div aria-busy="true" className="flex flex-col gap-3 py-2">
            <p className="sr-only">Loading closures</p>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        )}
        {list.isError && <LoadError message={`Couldn't load closures: ${(list.error as Error).message}`} onRetry={() => void list.refetch()} />}
        {list.data && list.data.length === 0 && <p className="py-2 text-sm text-ink-muted">No upcoming closures.</p>}
        {shown.length > 0 && (
          <ul aria-label="Upcoming closures" className="divide-y divide-line">
            {shown.map((b, i) => (
              <m.li
                key={b.id}
                variants={fadeUp}
                initial="initial"
                animate={{ ...fadeUp.animate, transition: { ...(fadeUp.animate as { transition: object }).transition, delay: staggerDelay(i) } }}
                className="flex flex-wrap items-center gap-x-5 gap-y-1 py-3 text-sm"
              >
                <span className="w-44 shrink-0 font-semibold text-ink">{formatDate(b.date)}</span>
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block text-ink">{b.reason}</span>
                  <span className="block text-label text-ink-muted">{when(b)} · {scope(b.sacraments)}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Delete closure ${b.reason}`}
                  onClick={() => { remove.reset(); setPendingDelete({ id: b.id, reason: b.reason }) }}
                  className={`min-h-11 rounded-lg px-3 text-sm font-semibold text-danger hover:bg-status-rejected-bg ${FOCUS}`}
                >
                  Remove
                </button>
              </m.li>
            ))}
          </ul>
        )}
        <ListPager page={current} pageCount={pageCount} total={all.length} size={PAGE} onPage={setPage} className="mt-2 border-t border-line pt-3" />

        <section aria-label="Easter Triduum" className="mt-4 border-t border-line pt-4">
          <h3 className="mb-1 text-label font-semibold text-ink-muted">Easter Triduum (closed automatically)</h3>
          <ul className="text-sm text-ink">
            {triduum.map((t) => (
              <li key={t.date}>
                {formatDate(t.date)} &mdash; {t.reason}
              </li>
            ))}
          </ul>
        </section>
      </section>

      {pendingDelete && (
        <Dialog open onOpenChange={(open) => !open && setPendingDelete(null)}>
          <DialogContent className={REG_DIALOG_NARROW} aria-label="Remove this closure">
            <div>
              <DialogTitle className="mb-1.5 font-display text-2xl font-semibold leading-tight text-navy">Remove this closure?</DialogTitle>
              <DialogDescription className="text-[14px] leading-normal text-ink-muted">
                “{pendingDelete.reason}” will be removed. Parishioners will be able to book that date again.
              </DialogDescription>
            </div>
            {remove.isError && <p role="alert" className="text-[14px] font-medium text-danger">{(remove.error as Error).message}</p>}
            <div className="flex flex-col-reverse gap-2.5 pt-2 md:flex-row md:justify-end">
              <button type="button" onClick={() => setPendingDelete(null)} className={BTN_OUTLINE}>Keep closure</button>
              <button type="button" disabled={remove.isPending} onClick={() => remove.mutate(pendingDelete.id)} className={BTN_DANGER}>
                {remove.isPending ? 'Removing…' : 'Remove closure'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  )
}
