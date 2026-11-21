import { Link } from 'react-router-dom'
import { CalendarX2, CalendarDays, Phone, Printer } from 'lucide-react'
import { LoadError } from '../../components/shared/LoadError'
import { Skeleton } from '../../components/shared/Skeleton'
import { formatTime } from '../../lib/domain'
import type { ScheduleDay } from '../../lib/types'
import { cn } from '../../lib/utils'
import { RIBBON_SPAN, RIBBON_START, ribbonPct, type DayModel, type VisitRow, type VisitState } from './dashboardModel'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

// Each state keeps its text and background in one string so the contrast check can read them together.
const BLOCK: Record<VisitState, string> = {
  done: 'border-2 border-navy bg-navy text-white',
  next: 'border-2 border-navy bg-surface text-navy',
  later: 'border-[1.5px] border-hollow bg-paper text-ink-muted',
}
const TIME_COLOR: Record<VisitState, string> = { done: 'text-ink-muted', next: 'text-navy', later: 'text-ink-muted' }
const PILL: Record<'done' | 'next' | 'pending', string> = {
  done: 'bg-status-done-bg text-status-done-fg',
  next: 'bg-status-confirmed-bg text-status-confirmed-fg',
  pending: 'bg-status-pending-bg text-status-pending-fg',
}

const HOUR_LABELS: Array<[number, string]> = [[0, '6 AM'], [3, '9 AM'], [6, '12 PM'], [9, '3 PM'], [12, '6 PM']]

function rangePct(startHHMM: string, endHHMM: string) {
  const left = ribbonPct(startHHMM)
  const right = Math.max(left, ribbonPct(endHHMM))
  return { left: `${left}%`, width: `${Math.max(right - left, 0)}%` }
}

/** The day as a strip from 6 AM to 6 PM: one block per visit, dashed blocks for travel, and a marker for now. */
function Ribbon({ model, compact, nowMin, showNow, ariaLabel }: { model: DayModel; compact: boolean; nowMin: number; showNow: boolean; ariaLabel: string }) {
  const nowPct = ((nowMin - RIBBON_START) / RIBBON_SPAN) * 100
  const nowVisible = showNow && nowPct >= 0 && nowPct <= 100
  return (
    <div role="img" aria-label={ariaLabel} className={cn('relative mb-1', compact ? 'h-[76px]' : 'h-[84px]')}>
      {Array.from({ length: 13 }, (_, i) => (
        <span key={i} aria-hidden="true" className="absolute bottom-6 top-0 w-px bg-line" style={{ left: `${(i / 12) * 100}%` }} />
      ))}
      {HOUR_LABELS.map(([h, t]) => (
        <span
          key={t}
          aria-hidden="true"
          className={cn('absolute bottom-0 whitespace-nowrap text-ink-muted', compact ? 'text-[12px]' : 'text-[13px]')}
          style={{ left: `${(h / 12) * 100}%`, transform: `translateX(${h === 0 ? '0' : h === 12 ? '-100%' : '-50%'})` }}
        >
          {t}
        </span>
      ))}
      {model.rows.map((r) => {
        if (r.kind === 'visit') {
          const { item, state, first, travelBefore } = r.row
          return (
            <span key={r.row.key}>
              {travelBefore && (
                <span
                  title={`Leave by ${formatTime(travelBefore.start)}`}
                  className="absolute rounded-[7px] border-[1.5px] border-dashed border-hollow"
                  style={{ ...rangePct(travelBefore.start, travelBefore.end), top: compact ? 12 : 14, height: compact ? 38 : 42 }}
                />
              )}
              <span
                title={`${formatTime(item.start)} · ${item.subjectName} · ${r.row.sub}`}
                className={cn(
                  'absolute flex items-center overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold',
                  compact ? 'top-3 h-[38px] rounded-[7px]' : 'top-[14px] h-[42px] rounded-lg px-2',
                  BLOCK[state],
                )}
                style={rangePct(item.start, item.end ?? item.start)}
              >
                {!compact && first}
              </span>
            </span>
          )
        }
        const o = r.row
        return (
          <span
            key={o.key}
            title={`${formatTime(o.start)} · ${o.title}`}
            className={cn('absolute border-[1.5px] border-hollow bg-paper', compact ? 'top-3 h-[38px] rounded-[7px]' : 'top-[14px] h-[42px] rounded-lg')}
            style={rangePct(o.start, o.end)}
          />
        )
      })}
      {nowVisible && (
        <>
          <span aria-hidden="true" className="absolute bottom-6 top-1 -ml-px w-0.5 bg-gold" style={{ left: `${nowPct}%` }} />
          {!compact && (
            <span aria-hidden="true" className="absolute -top-1 -translate-x-1/2 bg-surface px-1 text-[12px] font-semibold text-navy" style={{ left: `${nowPct}%` }}>
              Now
            </span>
          )}
        </>
      )}
    </div>
  )
}

function VisitLine({ row, compact }: { row: VisitRow; compact: boolean }) {
  const { item, state, pill, sub } = row
  const call = state === 'next' && item.contactPhone
  const callName = item.contactName ?? item.subjectName
  const pillEl = pill && (
    <span className={cn('inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-xl px-2.5 text-[13px] font-medium', PILL[pill.tone], compact && 'mt-1')}>{pill.text}</span>
  )
  return (
    <li className={cn('flex min-h-16 items-center border-t border-line py-2', compact ? 'gap-3' : 'gap-3.5')}>
      <span className={cn('shrink-0 text-[14px] font-semibold tabular-nums', compact ? 'w-[66px]' : 'w-[76px]', TIME_COLOR[state])}>{formatTime(item.start)}</span>
      <Link to={`/bookings/${item.id}`} className={cn('min-w-0 flex-1 rounded-md text-ink no-underline', FOCUS)}>
        <span className="block text-[15px] font-semibold">{item.subjectName}</span>
        <span className="block text-[13px] text-ink-muted">{sub}</span>
        {compact && pillEl && <span className="block">{pillEl}</span>}
      </Link>
      {!compact && pillEl}
      <span className="flex w-11 shrink-0 justify-end">
        {call && (
          <a
            href={`tel:${item.contactPhone!.replace(/[^\d+]/g, '')}`}
            aria-label={`Call ${callName}`}
            className={cn('flex size-11 items-center justify-center rounded-xl border border-input-border bg-surface text-navy', FOCUS)}
          >
            <Phone size={18} aria-hidden="true" />
          </a>
        )}
      </span>
    </li>
  )
}

export function DayPanelSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the day" className="flex flex-col gap-3">
      <Skeleton className="h-[84px] w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

/** One day: its title, a Print button, the closed-day note, the ribbon and the list of visits. */
export function DayPanel({
  title,
  day,
  model,
  compact,
  nowMin,
  isToday,
  loading,
  error,
  onRetry,
  onPrint,
  weekStrip,
}: {
  title: string
  day: ScheduleDay | undefined
  model: DayModel
  compact: boolean
  nowMin: number
  isToday: boolean
  loading: boolean
  error: string | null
  onRetry: () => void
  onPrint: () => void
  /** The phone's seven-day strip, drawn above the title. */
  weekStrip?: React.ReactNode
}) {
  const closed = day?.blackouts ?? []
  const ribbonLabel = `${title}: ${
    model.rows.length
      ? model.rows.map((r) => (r.kind === 'visit' ? `${formatTime(r.row.item.start)} ${r.row.item.subjectName}, ${r.row.sub}` : `${formatTime(r.row.start)} ${r.row.title}`)).join('; ')
      : 'no visits'
  }.`
  const empty = model.rows.length === 0

  return (
    <section aria-label="The day" className={cn('min-w-0 rounded-2xl border border-line bg-surface', compact ? 'px-4 pb-1.5 pt-4' : 'px-6 pb-2 pt-5')}>
      {weekStrip}
      <div className={cn('flex items-center justify-between gap-2', compact ? 'mb-3' : 'mb-3.5')}>
        <h2 className={cn('font-display font-semibold text-navy', compact ? 'text-[20px]' : 'text-[22px]')}>{title}</h2>
        {compact ? (
          <button type="button" onClick={onPrint} className={cn('inline-flex min-h-11 items-center rounded-md text-[14px] font-semibold text-navy underline underline-offset-[3px]', FOCUS)}>
            Print
          </button>
        ) : (
          <button
            type="button"
            onClick={onPrint}
            className={cn('inline-flex h-9 min-h-11 items-center gap-1.5 lg:min-h-0 rounded-[10px] border border-input-border bg-surface px-3 text-[13px] font-semibold text-navy hover:bg-paper', FOCUS)}
          >
            <Printer size={16} aria-hidden="true" />
            Print
          </button>
        )}
      </div>

      {error ? (
        <LoadError message={error} onRetry={onRetry} className="mb-4" />
      ) : loading ? (
        <DayPanelSkeleton />
      ) : (
        <>
          {closed.length > 0 && (
            <p role="note" className="mb-3.5 flex items-center gap-2 rounded-xl bg-paper-deep px-3.5 py-2.5 text-[14px] text-ink">
              <CalendarX2 size={16} aria-hidden="true" className="shrink-0" />
              Closed: {closed.map((b) => b.reason).join('; ')}
            </p>
          )}
          {/* A day with no visits is one line, not an empty timeline. */}
          {!empty && <Ribbon model={model} compact={compact} nowMin={nowMin} showNow={isToday} ariaLabel={ribbonLabel} />}
          {empty ? (
            <p className="border-t border-line pb-4 pt-3.5 text-[14px] text-ink-muted">No visits.</p>
          ) : (
            <ul className="mt-2">
              {model.rows.map((r) =>
                r.kind === 'visit' ? (
                  <VisitLine key={r.row.key} row={r.row} compact={compact} />
                ) : (
                  <li key={r.row.key} className="flex min-h-16 items-center gap-3.5 border-t border-line py-2">
                    <span className={cn('shrink-0 text-[14px] font-semibold tabular-nums text-ink-muted', compact ? 'w-[66px]' : 'w-[76px]')}>{formatTime(r.row.start)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-ink">{r.row.title}</span>
                      <span className="block text-[13px] text-ink-muted">{r.row.sub}</span>
                    </span>
                    <span className="w-11 shrink-0" />
                  </li>
                ),
              )}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

/** Compact seven-day strip for the phone: weekday, date and a dot for a day with visits. */
export function WeekStrip({
  days,
  selected,
  byDate,
  onSelect,
  onOpenMonth,
}: {
  days: string[]
  selected: string
  byDate: Map<string, ScheduleDay>
  onSelect: (date: string) => void
  onOpenMonth: () => void
}) {
  return (
    <div className="mb-3.5 flex items-center gap-1.5">
      <div role="group" aria-label="This week" className="grid flex-1 grid-cols-7 gap-0.5">
        {days.map((d, i) => {
          const day = byDate.get(d)
          const closed = !!day && day.blackouts.length > 0
          const sel = d === selected
          const n = day ? day.items.filter((x) => x.type === 'booking').length : 0
          return (
            <button
              key={d}
              type="button"
              aria-label={`${new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}${closed ? ', parish closed' : ''}${n ? `, ${n} ${n === 1 ? 'visit' : 'visits'}` : ''}`}
              aria-pressed={sel}
              onClick={() => onSelect(d)}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border-2',
                FOCUS,
                sel ? 'border-navy bg-status-confirmed-bg' : 'border-transparent',
                closed ? 'text-ink-muted' : 'text-ink',
              )}
            >
              <span aria-hidden="true" className="text-[12px] font-medium text-ink-muted">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][i]}</span>
              <span aria-hidden="true" className={cn('text-[16px]', sel ? 'font-semibold' : 'font-medium', closed && 'line-through')}>{Number(d.slice(8))}</span>
              <span aria-hidden="true" className={cn('size-[5px] rounded-full bg-navy', n > 0 ? 'opacity-100' : 'opacity-0')} />
            </button>
          )
        })}
      </div>
      <button
        type="button"
        aria-label="Open the month"
        onClick={onOpenMonth}
        className={cn('flex h-14 w-11 shrink-0 items-center justify-center rounded-xl border border-input-border bg-surface text-navy', FOCUS)}
      >
        <CalendarDays size={20} aria-hidden="true" />
      </button>
    </div>
  )
}
