import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import * as m from 'motion/react-m'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { LoadError } from '../../components/shared/LoadError'
import { ListPager } from '../../components/shared/ListPager'
import { Skeleton } from '../../components/shared/Skeleton'
import { fetchAuditLog } from '../../lib/data/audit-log'
import { useTenPerPage } from '../../lib/hooks/useTenPerPage'
import { fadeUp, staggerDelay } from '../../lib/motion'
import type { AuditLogEntry } from '../../lib/types'
import { BTN_OUTLINE, REG_INPUT } from '../register/registerForm'
import { ActivityRail } from './ActivityRail'
import { Avatar } from './Avatar'
import { actionSentence, AREAS } from './sentences'

const NONE: AuditLogEntry[] = []

/** The parish-local date `n` days before today, as YYYY-MM-DD. */
const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
/** Actions that undo or remove something are written in the danger colour so they stand out in a long list. */
const DANGER = new Set(['register.revoked', 'user.deactivated', 'booking.declined', 'certificate_request.declined', 'parish_event.deleted', 'blackout.deleted', 'privacy.erased', 'booking.refunded'])

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA')
const dayLabel = (iso: string) => {
  const d = new Date(iso)
  const long = d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(iso) === today.toLocaleDateString('en-CA')) return `Today · ${long}`
  if (dayKey(iso) === yesterday.toLocaleDateString('en-CA')) return `Yesterday · ${long}`
  return d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}
/** What the entry was about, in words a person recognises: a booking's reference number. Never a database id. */
const referenceOf = (e: AuditLogEntry) => (typeof e.metadata?.reference === 'string' && e.metadata.reference ? e.metadata.reference : null)
/** The exact record, for the rare time someone needs to quote it: kept in the hover/long-press text, not on the page. */
const recordText = (e: AuditLogEntry) => `${e.action} · ${e.subjectType} ${e.subjectId}`
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function groupByDay(rows: AuditLogEntry[]) {
  const groups: { key: string; label: string; rows: AuditLogEntry[] }[] = []
  for (const r of rows) {
    const key = dayKey(r.createdAt)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.rows.push(r)
    else groups.push({ key, label: dayLabel(r.createdAt), rows: [r] })
  }
  return groups
}

function EntryRow({ e, index }: { e: AuditLogEntry; index: number }) {
  const sentence = actionSentence(e.action)
  const known = sentence !== e.action
  const reference = referenceOf(e)
  return (
    <m.li
      title={recordText(e)}
      variants={fadeUp}
      initial="initial"
      animate={{ ...fadeUp.animate, transition: { ...(fadeUp.animate as { transition: object }).transition, delay: staggerDelay(index) } }}
      className="flex min-h-[68px] items-center gap-3.5 border-b border-line px-4 py-3 last:border-b-0 md:px-[22px]"
    >
      <Avatar name={e.actor.fullName} />
      <div className="min-w-0 flex-1">
        <p className="break-words text-[15px] leading-snug text-ink">
          <span className="font-semibold">{e.actor.fullName ?? 'System'}</span>{' '}
          <span className={DANGER.has(e.action) ? 'font-medium text-danger' : undefined}>{known ? lowerFirst(sentence) : e.action}</span>{' '}
          {reference && <span className="whitespace-nowrap text-ink-muted" translate="no">{reference}</span>}
          {!known && !reference && <span className="text-ink-muted" translate="no">{e.subjectType}</span>}
        </p>
      </div>
      <time dateTime={e.createdAt} className="shrink-0 whitespace-nowrap text-[13px] tabular-nums text-ink-muted">{timeOf(e.createdAt)}</time>
    </m.li>
  )
}

function FeedSkeleton() {
  return (
    <div aria-busy="true" className="overflow-hidden rounded-2xl border border-line bg-surface">
      <p role="status" className="sr-only">Loading the audit log</p>
      <div className="h-10 border-b border-line bg-paper" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex min-h-[68px] items-center gap-3.5 border-b border-line px-4 py-3 last:border-b-0 md:px-[22px]">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="mt-2 h-3 w-1/3" /></div>
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  )
}

export function AuditLogScreen() {
  const [page, setPage] = useState(1)
  const [area, setArea] = useState('')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('') // the search, once typing has paused
  const [range, setRange] = useState<'14' | '7' | '30' | 'all'>('14')

  useEffect(() => {
    const id = setTimeout(() => { // debounce
      setQ(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  const from = range === 'all' ? undefined : daysAgo(Number(range) - 1)
  const filters = { area: area || undefined, q: q || undefined, from }
  const { data, isLoading, isError, error, refetch } = useTenPerPage({
    queryKey: ['admin-audit-log', filters],
    page,
    serverSize: 20,
    fetchPage: (serverPage) => fetchAuditLog(serverPage, filters),
  })

  const filtered = Boolean(area || q || range !== '14')
  const rows = data?.rows ?? NONE
  const emptyText = filtered ? 'Nothing matches' : 'No audit log entries yet.'
  const groups = groupByDay(rows)
  let rowIndex = 0

  function reset() {
    setArea('')
    setSearch('')
    setQ('')
    setRange('14')
    setPage(1)
  }

  return (
    <AdminLayout title="Audit Log">
      <div className="grid w-full max-w-[1760px] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="max-w-[640px] text-[14px] text-ink-muted">Who did what, newest first. Entries cannot be edited or removed. Hold your pointer over an entry to see its exact record.</p>

        <div role="search" aria-label="Filter the audit log" className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,360px)_200px_auto] xl:items-end">
            <label className="relative flex flex-col gap-1 text-[14px] font-medium text-ink sm:col-span-2 xl:col-span-1">
              Search the log
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute bottom-[16px] left-3.5 text-ink-muted" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Person, record or action" className={`${REG_INPUT} pl-10`} />
            </label>
            <label className="flex flex-col gap-1 text-[14px] font-medium text-ink">
              Show
              <select value={range} onChange={(e) => { setRange(e.target.value as typeof range); setPage(1) }} className={REG_INPUT}>
                <option value="14">Last 14 days</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="all">All time</option>
              </select>
            </label>
            {filtered && <button type="button" onClick={reset} className={BTN_OUTLINE}>Clear filters</button>}
          </div>
          <div role="radiogroup" aria-label="Area" className="flex flex-wrap gap-2">
            {AREAS.map((a) => {
              const on = area === a.value
              return (
                <button
                  key={a.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => { setArea(a.value); setPage(1) }}
                  className={`inline-flex min-h-11 items-center rounded-xl text-[14px] text-navy ${FOCUS} ${on ? 'border-2 border-navy bg-status-confirmed-bg px-[13px] font-semibold' : 'border border-input-border bg-surface px-3.5 font-medium'}`}
                >
                  {a.label}
                </button>
              )
            })}
          </div>
        </div>

        {isLoading && <FeedSkeleton />}
        {isError && <LoadError title="The log didn’t load" message="Check your connection, then try again." detail={(error as Error).message} onRetry={() => void refetch()} />}
        {!isLoading && !isError && rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
            <span role="img" aria-label="Nothing found" className="flex size-12 items-center justify-center rounded-full bg-paper-deep text-navy"><Search size={22} aria-hidden="true" /></span>
            <p className="text-[17px] font-semibold text-ink">{emptyText}</p>
            {filtered && <p className="text-[14px] text-ink-muted">Try another name, record or area.</p>}
          </div>
        )}

        {rows.length > 0 && (
          <section aria-label="Audit log" className="overflow-hidden rounded-2xl border border-line bg-surface">
            {groups.map((g, gi) => (
              <div key={g.key}>
                <h2 className={`border-b border-line bg-paper px-4 py-3 text-[13px] font-semibold text-ink-muted md:px-[22px] ${gi > 0 ? 'border-t' : ''}`}>{g.label}</h2>
                <ul>
                  {g.rows.map((e) => <EntryRow key={e.id} e={e} index={rowIndex++} />)}
                </ul>
              </div>
            ))}
          </section>
        )}

        {data && <ListPager page={page} pageCount={data.pageCount} total={data.total} onPage={setPage} />}
      </div>
      <ActivityRail />
      </div>
    </AdminLayout>
  )
}
