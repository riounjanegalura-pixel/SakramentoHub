import { useRef, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, Check, ChevronDown, ChevronRight, PanelRightOpen, Search, SlidersHorizontal, X } from 'lucide-react'
import * as m from 'motion/react-m'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { Reveal } from '../../components/shared/Reveal'
import { LoadError } from '../../components/shared/LoadError'
import { Skeleton } from '../../components/shared/Skeleton'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { fetchBookingCounts, fetchBookings, type BookingCounts } from '../../lib/data/bookings'
import { SACRAMENT_LABEL } from '../../lib/constants'
import { parishToday, PAYMENT_LABEL, STATUS_LABEL } from '../../lib/domain'
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue'
import { useIsPhone } from '../../lib/hooks/useIsPhone'
import { durations, ease, staggerDelay } from '../../lib/motion'
import type { AdminBooking, BookingStatus, Channel, PaymentStatus, Sacrament } from '../../lib/types'
import { cn } from '../../lib/utils'
import { nextStep, paymentCell, VIEWS, viewKeyFor, whenText, type PayTone, type ViewKey } from './bookingModel'
import { BookingPeek } from './BookingPeek'
import { CARD, FOCUS, INPUT, OUTLINE_BTN, TabBar } from './parts'

const STATUS_OPTIONS: BookingStatus[] = ['submitted', 'returned', 'approved', 'completed', 'declined', 'cancelled', 'draft']
const PAYMENT_OPTIONS: PaymentStatus[] = ['paid', 'unpaid', 'pending_cash', 'refund_due', 'refunded', 'not_required', 'void']
const CHANNEL_OPTIONS: Channel[] = ['online', 'walk_in']
const CHANNEL_LABEL: Record<Channel, string> = { online: 'Online', walk_in: 'Walk-in' }
const SACRAMENT_OPTIONS = Object.keys(SACRAMENT_LABEL) as Sacrament[]
const YMD = /^\d{4}-\d{2}-\d{2}$/
const NO_BOOKINGS: AdminBooking[] = []
const FILTER_KEYS = ['sacrament', 'status', 'paymentStatus', 'channel', 'from', 'to', 'attention']
/** A booking is a link and a Quick view button; the text colours of the Payment column follow its tone. */
const PAY_TEXT: Record<PayTone, string> = { ok: 'text-status-done-fg', warn: 'text-status-pending-fg', bad: 'text-status-rejected-fg', mute: 'text-ink-muted' }

/** A URL list restricted to known values; anything else counts as "no filter". */
function listOf<T extends string>(value: string | null, options: readonly T[]): T[] {
  return (value ?? '').split(',').filter((v): v is T => options.includes(v as T))
}
const dateParam = (value: string | null): string => (value && YMD.test(value) ? value : '')

/** The tab badge for one view: the total, or the sum of the chosen sacraments (the counts request ignores that filter). */
function countOf(counts: BookingCounts | undefined, sacraments: Sacrament[]): number | undefined {
  if (!counts) return undefined
  return sacraments.length === 0 ? counts.total : sacraments.reduce((n, s) => n + (counts.bySacrament[s] ?? 0), 0)
}

const filterLabel = (name: string, picked: string[]) => (picked.length === 0 ? name : picked.length <= 2 ? `${name}: ${picked.join(', ')}` : `${name}: ${picked.length} selected`)

/** A filter button that opens a list of checkboxes. Several values can be picked; none means "all". */
function MultiFilter<T extends string>({ name, options, selected, onChange }: { name: string; options: Array<{ value: T; label: string }>; selected: T[]; onChange: (next: T[]) => void }) {
  const picked = options.filter((o) => selected.includes(o.value)).map((o) => o.label)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn('inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface px-3.5 text-[14px] font-medium text-navy hover:bg-paper', FOCUS, picked.length ? 'border-2 border-navy' : 'border border-input-border')}>
          {filterLabel(name, picked)}
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-xl border border-line bg-surface p-2">
        <div role="group" aria-label={name} className="flex flex-col">
          {options.map((o) => (
            <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-[14px] hover:bg-paper">
              <input
                type="checkbox"
                className="size-4"
                checked={selected.includes(o.value)}
                onChange={(e) => onChange(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))}
              />
              {o.label}
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className={`mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-lg text-[14px] font-semibold text-navy underline underline-offset-[3px] ${FOCUS}`}>
            Clear {name.toLowerCase()}
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}

const sacramentOptions = SACRAMENT_OPTIONS.map((s) => ({ value: s, label: SACRAMENT_LABEL[s] }))
const statusOptions = STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))
const paymentOptions = PAYMENT_OPTIONS.map((p) => ({ value: p, label: PAYMENT_LABEL[p] }))
const channelOptions = CHANNEL_OPTIONS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))

/** The same grid in the header and in every row, so the columns line up. */
const GRID = 'grid grid-cols-[minmax(230px,2fr)_150px_150px_110px_minmax(190px,1.6fr)_44px] gap-4'

function Row({ b, index, onPeek }: { b: AdminBooking; index: number; onPeek: (b: AdminBooking, opener: HTMLButtonElement) => void }) {
  const pay = paymentCell(b)
  const step = nextStep(b, Date.now(), parishToday())
  return (
    <m.li
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: durations.base, ease: [...ease], delay: staggerDelay(index) }}
      className={cn('relative border-b border-line last:border-b-0 hover:bg-paper', b.isEmergency && 'bg-status-rejected-bg/40')}
    >
      <div className={cn(GRID, 'min-h-[68px] items-center px-6 py-2.5')}>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            {/* The name link stretches over the whole row, so any click opens the booking; Quick view sits above it. */}
            <Link to={`/bookings/${b.id}`} title={b.subjectName} className={cn('max-w-full truncate text-[15px] font-semibold text-ink no-underline after:absolute after:inset-0 after:content-[""]', FOCUS)}>
              {b.subjectName}
            </Link>
            {b.isEmergency ? (
              <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-status-rejected-bg px-2 text-[12px] font-semibold text-status-rejected-fg">
                <AlertCircle size={12} strokeWidth={2.4} aria-hidden="true" />
                Urgent
              </span>
            ) : b.isPriority ? (
              <span className="inline-flex h-[22px] items-center rounded-full bg-status-pending-bg px-2 text-[12px] font-semibold text-status-pending-fg">Priority</span>
            ) : null}
            {b.channel === 'walk_in' && <span className="inline-flex h-[22px] items-center rounded-full bg-paper-deep px-2 text-[12px] font-semibold text-ink">Walk-in</span>}
          </span>
          <span className="mt-0.5 block text-[13px] text-ink-muted">
            {SACRAMENT_LABEL[b.sacrament]} · <span className="font-mono" translate="no">{b.referenceNumber}</span>
          </span>
        </span>
        <span className="text-[14px] leading-snug tabular-nums">{whenText(b)}</span>
        <span>
          <StatusBadge status={b.status} />
        </span>
        <span className={cn('text-[14px] font-medium', PAY_TEXT[pay.tone])}>{pay.label}</span>
        <span className="text-[14px] leading-snug text-ink">{step}</span>
        <button
          type="button"
          aria-label={`Quick view ${b.subjectName}`}
          onClick={(e) => onPeek(b, e.currentTarget)}
          className={cn('relative z-10 flex size-11 items-center justify-center rounded-[10px] text-navy hover:bg-surface', FOCUS)}
        >
          <PanelRightOpen size={20} aria-hidden="true" />
        </button>
      </div>
    </m.li>
  )
}

function PhoneCard({ b, index }: { b: AdminBooking; index: number }) {
  const pay = paymentCell(b)
  const step = nextStep(b, Date.now(), parishToday())
  return (
    <m.li initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: durations.base, ease: [...ease], delay: staggerDelay(index) }}>
      <Link to={`/bookings/${b.id}`} className={cn('block rounded-2xl border border-line p-4 py-3.5 text-ink no-underline', b.isEmergency ? 'bg-status-rejected-bg/40' : 'bg-surface', FOCUS)}>
        <span className="flex items-start justify-between gap-2.5">
          <span className="min-w-0">
            <span className="block text-[16px] font-semibold leading-snug">{b.subjectName}</span>
            <span className="mt-0.5 block text-[13px] text-ink-muted">
              {SACRAMENT_LABEL[b.sacrament]} · <span className="font-mono" translate="no">{b.referenceNumber}</span>
            </span>
          </span>
          <StatusBadge status={b.status} className="shrink-0" />
        </span>
        <span className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-ink-muted">
          {b.isEmergency && <span className="font-semibold text-status-rejected-fg">Urgent</span>}
          <span className="tabular-nums">{b.isEmergency ? 'No time, urgent' : whenText(b)}</span>
          <span className={cn('font-medium', PAY_TEXT[pay.tone])}>{pay.label}</span>
        </span>
        <span className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[14px] font-medium">
          <span>{step}</span>
          <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-ink-muted" />
        </span>
      </Link>
    </m.li>
  )
}

/** A chip you can switch on and off (phone filters): the selected state is a thicker border and a tick, not colour alone. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-surface px-3 text-[14px] font-medium text-navy', FOCUS, on ? 'border-2 border-navy' : 'border border-input-border')}
    >
      {on && <Check size={14} strokeWidth={3} aria-hidden="true" />}
      {children}
    </button>
  )
}

function ChipGroup<T extends string>({ name, options, selected, onChange }: { name: string; options: Array<{ value: T; label: string }>; selected: T[]; onChange: (next: T[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[14px] font-semibold">{name}</h3>
      <div role="group" aria-label={name} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.value} on={selected.includes(o.value)} onClick={() => onChange(selected.includes(o.value) ? selected.filter((v) => v !== o.value) : [...selected, o.value])}>
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}

export function BookingsQueueScreen() {
  const navigate = useNavigate()
  const phone = useIsPhone()
  // Every filter except the search box lives in the URL (?sacrament=baptism,wedding&paymentStatus=refund_due…),
  // so a view is linkable (the dashboard's Waiting tiles open pre-filtered queues) and survives a round trip into a
  // booking and back. Several values are comma-separated; the server matches any of them.
  const [searchParams, setSearchParams] = useSearchParams()
  const sacraments = listOf(searchParams.get('sacrament'), SACRAMENT_OPTIONS)
  const statuses = listOf(searchParams.get('status'), STATUS_OPTIONS)
  const payments = listOf(searchParams.get('paymentStatus'), PAYMENT_OPTIONS)
  const channels = listOf(searchParams.get('channel'), CHANNEL_OPTIONS)
  // A draft has no confirmed appointment, so a date range can never apply to one: it is ignored (and its inputs disabled).
  const onlyDrafts = statuses.length === 1 && statuses[0] === 'draft'
  const from = onlyDrafts ? '' : dateParam(searchParams.get('from'))
  const to = onlyDrafts ? '' : dateParam(searchParams.get('to'))
  const attention: 'overpaid' | '' = searchParams.get('attention') === 'overpaid' ? 'overpaid' : ''
  const [priority, setPriority] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // The panel has no Radix trigger, so we hand focus back to the Quick view button that opened it.
  const peekOpener = useRef<HTMLButtonElement | null>(null)
  const [peek, setPeek] = useState<AdminBooking | null>(null)

  // Debounced so a query re-fetch fires once typing pauses, not on every keystroke; the raw `search` state still
  // drives the input's own value, so what is shown never lags what was typed.
  const debouncedSearch = useDebouncedValue(search, 300)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-bookings', statuses, payments, channels, sacraments, priority, debouncedSearch, from, to, attention, page],
    queryFn: () => fetchBookings({ status: statuses, paymentStatus: payments, channel: channels, sacrament: sacraments, priority, search: debouncedSearch, from, to, attention, page, perPage: 10 }),
  })

  // One count per view, under the same filters the list uses, so each badge matches what clicking that tab shows.
  // The 'admin-bookings' prefix means any status action on the detail screen (which invalidates it) refreshes them.
  const viewCounts = useQueries({
    queries: VIEWS.map((v) => ({
      queryKey: ['admin-bookings', 'counts', v.key, payments, channels, debouncedSearch, from, to, attention],
      queryFn: () => fetchBookingCounts({ status: v.status, paymentStatus: payments, channel: channels, search: debouncedSearch, from, to, attention }),
    })),
  })

  function patch(change: (params: URLSearchParams) => void) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        change(params)
        return params
      },
      { replace: true },
    )
    setPage(1)
  }
  const setList = (key: string, values: readonly string[]) =>
    patch((p) => {
      if (values.length) p.set(key, values.join(','))
      else p.delete(key)
      // Choosing only Draft drops the date range from the address, so it is gone if the status changes again.
      if (key === 'status' && values.length === 1 && values[0] === 'draft') {
        p.delete('from')
        p.delete('to')
      }
    })
  const setParam = (key: string, value: string) =>
    patch((p) => {
      if (value) p.set(key, value)
      else p.delete(key)
    })
  const setView = (key: ViewKey) => {
    const status = VIEWS.find((v) => v.key === key)?.status
    setList('status', status ? [status] : [])
  }
  const clearFilters = () => {
    patch((p) => FILTER_KEYS.forEach((k) => p.delete(k)))
    setPriority(false)
    setSearch('')
  }

  const view = viewKeyFor(statuses)
  const moreCount = [channels.length > 0, !!(from || to), priority].filter(Boolean).length
  const groupsOn = [sacraments.length > 0, statuses.length > 0, payments.length > 0, channels.length > 0, !!(from || to), priority, !!attention].filter(Boolean).length
  const anyFilter = groupsOn > 0 || search.trim() !== ''
  const rows = data?.data ?? NO_BOOKINGS
  const meta = data?.meta
  const first = meta ? (meta.current_page - 1) * meta.per_page + 1 : 0
  const showing = meta && rows.length > 0 ? `Showing ${first}–${first + rows.length - 1} of ${meta.total}` : ''
  const total = meta?.total ?? 0

  const tabs = VIEWS.map((v, i) => ({ key: v.key, label: v.label, count: countOf(viewCounts[i].data, sacraments) }))

  const pager = meta && meta.last_page > 1 && (
    <div className={cn('flex gap-2', phone ? 'p-4' : 'items-center justify-between px-6 py-3')}>
      {!phone && <span role="status" className="text-[14px] text-ink-muted">{showing}</span>}
      <div className={cn('flex gap-2', phone && 'w-full')}>
        <Button type="button" variant="outline" disabled={meta.current_page <= 1} onClick={() => setPage(meta.current_page - 1)} className={cn(OUTLINE_BTN, 'min-h-11 px-4 text-[14px]', phone && 'min-h-12 flex-1 text-[15px]')}>
          Previous
        </Button>
        <Button type="button" variant="outline" disabled={meta.current_page >= meta.last_page} onClick={() => setPage(meta.current_page + 1)} className={cn(OUTLINE_BTN, 'min-h-11 px-4 text-[14px]', phone && 'min-h-12 flex-1 text-[15px]')}>
          Next
        </Button>
      </div>
    </div>
  )

  return (
    <AdminLayout title="Bookings">
      <div className="flex w-full max-w-[1760px] flex-col gap-4">
        <TabBar label="Booking views" tabs={tabs} value={view} onChange={setView} className={cn(phone && 'gap-x-5 overflow-x-auto [scrollbar-width:none]')} />

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-0 flex-[1_1_280px] md:max-w-[360px]">
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 text-ink-muted" />
            <label htmlFor="booking-search" className="sr-only">Search bookings</label>
            <input
              id="booking-search"
              type="search"
              value={search}
              placeholder={phone ? 'Name or reference' : 'Name, email or reference'}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className={cn(INPUT, 'h-12 pl-[42px] pr-3.5 md:h-11', FOCUS)}
            />
          </div>

          {phone ? (
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className={cn('inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-surface px-3.5 text-[15px] font-semibold text-navy', FOCUS, groupsOn ? 'border-2 border-navy' : 'border border-input-border')}
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
              Filters{' '}
              {groupsOn > 0 && <span className="tabular-nums">{groupsOn}</span>}
            </button>
          ) : (
            <>
              <MultiFilter name="Sacrament" options={sacramentOptions} selected={sacraments} onChange={(v) => setList('sacrament', v)} />
              <MultiFilter name="Status" options={statusOptions} selected={statuses} onChange={(v) => setList('status', v)} />
              <MultiFilter name="Payment" options={paymentOptions} selected={payments} onChange={(v) => setList('paymentStatus', v)} />
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className={cn('inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface px-3.5 text-[14px] font-medium text-navy hover:bg-paper', FOCUS, moreCount ? 'border-2 border-navy' : 'border border-input-border')}>
                    {moreCount ? `More filters: ${moreCount}` : 'More filters'}
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 rounded-xl border border-line bg-surface p-3">
                  <div className="flex flex-col gap-3">
                    <fieldset className="flex flex-col border-0 p-0">
                      <legend className="mb-1 p-0 text-[14px] font-semibold">How it came in</legend>
                      {channelOptions.map((o) => (
                        <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1.5 text-[14px] hover:bg-paper">
                          <input type="checkbox" className="size-4" checked={channels.includes(o.value)} onChange={(e) => setList('channel', e.target.checked ? [...channels, o.value] : channels.filter((c) => c !== o.value))} />
                          {o.label}
                        </label>
                      ))}
                    </fieldset>
                    <fieldset className="flex flex-col gap-1.5 border-0 p-0">
                      <legend className="mb-1 p-0 text-[14px] font-semibold">Appointment between</legend>
                      <div className="flex items-center gap-2">
                        <input type="date" aria-label="Appointment from" value={from} disabled={onlyDrafts} onChange={(e) => setParam('from', e.target.value)} className={cn(INPUT, 'h-11 min-w-0 flex-1 px-2 text-[14px]', FOCUS)} />
                        <span aria-hidden="true">–</span>
                        <input type="date" aria-label="Appointment to" value={to} disabled={onlyDrafts} onChange={(e) => setParam('to', e.target.value)} className={cn(INPUT, 'h-11 min-w-0 flex-1 px-2 text-[14px]', FOCUS)} />
                      </div>
                      {onlyDrafts && <p className="text-[13px] text-ink-muted">Drafts have no confirmed date yet.</p>}
                      {!!from !== !!to && <p className="text-[13px] text-ink-muted">Set both dates to filter by appointment.</p>}
                    </fieldset>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1.5 text-[14px] hover:bg-paper">
                      <input type="checkbox" className="size-4" checked={priority} onChange={(e) => { setPriority(e.target.checked); setPage(1) }} />
                      Urgent first
                    </label>
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}

          {attention === 'overpaid' && (
            <span className="inline-flex min-h-11 items-center gap-1 rounded-full bg-status-pending-bg pl-3.5 pr-1 text-[14px] font-semibold text-status-pending-fg">
              Overpaid only
              <button type="button" aria-label="Remove overpaid filter" onClick={() => setParam('attention', '')} className={cn("flex size-11 items-center justify-center rounded-full", FOCUS)}>
                <X size={16} aria-hidden="true" />
              </button>
            </span>
          )}
          {anyFilter && (
            <button type="button" onClick={clearFilters} className={`inline-flex min-h-11 items-center px-2 text-[14px] font-semibold text-navy underline underline-offset-[3px] ${FOCUS}`}>
              Clear filters
            </button>
          )}
        </div>

        {isLoading && (
          <div role="status" aria-busy="true" aria-label="Loading bookings" className={cn(CARD, 'flex flex-col gap-3.5 px-6 py-4')}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[52px] rounded-[10px] bg-paper-deep" />
            ))}
          </div>
        )}

        {isError && <LoadError title="Bookings didn't load" message="The parish system did not answer. Check your connection, then try again." detail={(error as Error).message} onRetry={() => void refetch()} />}

        {data && rows.length === 0 && (
          <Reveal>
          <section className={cn(CARD, 'flex flex-col items-center gap-2 px-6 py-12 text-center')}>
            {anyFilter ? (
              <>
                <p className="text-[17px] font-semibold">{debouncedSearch.trim() ? `No bookings match "${debouncedSearch.trim()}"` : 'No bookings match these filters'}</p>
                <p className="mb-3 max-w-[360px] text-[14px] leading-normal text-ink-muted">Try a different name or reference, or clear the filters to see everything.</p>
                {from && to && <p className="mb-3 max-w-[360px] text-[14px] text-ink-muted">Drafts are not dated; clear the date range to see them.</p>}
                <Button type="button" variant="outline" className={cn(OUTLINE_BTN, 'min-h-11 px-5 text-[14px]')} onClick={clearFilters}>
                  Clear filters
                </Button>
              </>
            ) : (
              <>
                <p className="text-[17px] font-semibold">No bookings in this view</p>
                <p className="max-w-[360px] text-[14px] leading-normal text-ink-muted">New bookings show up here as they come in.</p>
              </>
            )}
          </section>
          </Reveal>
        )}

        {rows.length > 0 && !phone && (
          <section aria-label="Bookings" className={cn(CARD, 'overflow-x-auto')}>
            <div className="min-w-[900px]">
              <div className={cn(GRID, 'border-b border-line px-6 py-3 text-[13px] font-semibold text-ink-muted')}>
                <span>Booking</span>
                <span>Appointment</span>
                <span>Status</span>
                <span>Payment</span>
                <span>Next step</span>
                <span className="sr-only">Quick view</span>
              </div>
              <ul>
                {rows.map((b, i) => (
                  <Row
                    key={b.id}
                    b={b}
                    index={i}
                    onPeek={(booking, opener) => {
                      peekOpener.current = opener
                      setPeek(booking)
                    }}
                  />
                ))}
              </ul>
              {meta && (meta.last_page > 1 ? pager : <p role="status" className="px-6 py-3 text-[14px] text-ink-muted">{showing}</p>)}
            </div>
          </section>
        )}

        {rows.length > 0 && phone && (
          <>
            <ul aria-label="Bookings" className="flex flex-col gap-3">
              {rows.map((b, i) => (
                <PhoneCard key={b.id} b={b} index={i} />
              ))}
            </ul>
            <p role="status" className="text-center text-[13px] text-ink-muted">{showing}</p>
            {pager}
          </>
        )}
      </div>

      <BookingPeek booking={peek} onOpenChange={(o) => { if (!o) setPeek(null) }} onOpen={(id) => navigate(`/bookings/${id}`)} onCloseAutoFocus={(e) => { e.preventDefault(); peekOpener.current?.focus() }} />

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="max-h-[92vh] gap-4 overflow-y-auto rounded-t-[20px] bg-paper px-4 pb-6 pt-2.5">
          <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-sm bg-hollow" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="font-display text-[24px] font-semibold leading-tight text-navy">Filters</SheetTitle>
              <SheetDescription className="sr-only">Narrow the list of bookings.</SheetDescription>
            </div>
            <SheetClose aria-label="Close" className={`-mr-2 -mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-[10px] text-navy hover:bg-surface ${FOCUS}`}>
              <X size={22} aria-hidden="true" />
            </SheetClose>
          </div>
          <ChipGroup name="Sacrament" options={sacramentOptions} selected={sacraments} onChange={(v) => setList('sacrament', v)} />
          <ChipGroup name="Status" options={statusOptions} selected={statuses} onChange={(v) => setList('status', v)} />
          <ChipGroup name="Payment" options={paymentOptions} selected={payments} onChange={(v) => setList('paymentStatus', v)} />
          <ChipGroup name="How it came in" options={channelOptions} selected={channels} onChange={(v) => setList('channel', v)} />
          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 p-0 text-[14px] font-semibold">Appointment between</legend>
            <div className="flex items-center gap-2">
              <input type="date" aria-label="Appointment from" value={from} disabled={onlyDrafts} onChange={(e) => setParam('from', e.target.value)} className={cn(INPUT, 'min-w-0 flex-1 px-2 text-[14px]', FOCUS)} />
              <span aria-hidden="true">–</span>
              <input type="date" aria-label="Appointment to" value={to} disabled={onlyDrafts} onChange={(e) => setParam('to', e.target.value)} className={cn(INPUT, 'min-w-0 flex-1 px-2 text-[14px]', FOCUS)} />
            </div>
            {onlyDrafts && <p className="text-[13px] text-ink-muted">Drafts have no confirmed date yet.</p>}
            {!!from !== !!to && <p className="text-[13px] text-ink-muted">Set both dates to filter by appointment.</p>}
          </fieldset>
          <Chip on={priority} onClick={() => { setPriority((p) => !p); setPage(1) }}>Urgent first</Chip>
          <div className="mt-2 flex flex-col gap-2.5">
            <Button type="button" className="min-h-[52px] w-full rounded-xl text-[15px]" onClick={() => setFiltersOpen(false)}>
              {`Show ${total} ${total === 1 ? 'booking' : 'bookings'}`}
            </Button>
            <Button type="button" variant="outline" className={cn(OUTLINE_BTN, 'min-h-12 w-full')} onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AdminLayout>
  )
}
