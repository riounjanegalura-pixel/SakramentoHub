import { Link } from 'react-router-dom'
import { Check, ChevronRight, ClipboardList, Clock, RotateCcw, type LucideIcon } from 'lucide-react'
import { peso } from '../../lib/domain'
import type { AttentionCounts, WaitingPreviewItem } from '../../lib/types'
import { cn } from '../../lib/utils'
import { waitingCopy, waitingMix, waitingTotal } from './dashboardModel'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
const ICON: Record<WaitingPreviewItem['kind'], LucideIcon> = { hold: Clock, review: ClipboardList, refund: RotateCcw }
const ACTION = 'inline-flex items-center justify-center rounded-[10px] border border-input-border bg-surface font-semibold text-navy hover:bg-paper'

function AllCaughtUp({ compact }: { compact: boolean }) {
  return (
    <div className={cn('flex flex-col items-center gap-2.5 text-center', compact ? 'rounded-2xl border border-line bg-surface px-5 py-8' : 'px-6 pb-11 pt-9')}>
      <div role="img" aria-label="Done" className="flex size-12 items-center justify-center rounded-full bg-status-done-bg text-status-done-fg">
        <Check size={24} aria-hidden="true" />
      </div>
      <p className="text-[16px] font-semibold">You are all caught up</p>
    </div>
  )
}

/** The count, what it is made of, and the first few things to open. Bars are navy only; every row carries its number. */
function Mix({ attention, total, compact }: { attention: AttentionCounts; total: number; compact: boolean }) {
  const rows = waitingMix(attention)
  const max = Math.max(1, ...rows.map((r) => r.n))
  return (
    <div className={cn(compact ? 'rounded-2xl border border-line bg-surface px-4 pb-2.5 pt-4' : 'flex flex-wrap items-center gap-x-7 gap-y-3 px-6 pb-[18px] pt-2')}>
      <div className={cn(compact ? 'mb-2 flex items-baseline gap-2.5' : 'min-w-24 shrink-0 text-center')}>
        <p className={cn('font-display font-semibold leading-none tabular-nums text-navy', compact ? 'text-[48px]' : 'text-[64px]')}>{total}</p>
        <p className={cn('text-ink-muted', compact ? 'text-[15px]' : 'mt-1 text-[13px]')}>{compact ? 'items waiting' : total === 1 ? 'item' : 'items'}</p>
      </div>
      <ul className={cn('flex flex-col gap-0.5', compact ? '' : 'min-w-[260px] flex-1')}>
        {rows.map((r) => (
          <li key={r.key}>
            <Link to={r.to} className={cn('-mx-2 flex items-center gap-3 rounded-[10px] px-2 text-[14px] text-ink no-underline hover:bg-paper', compact ? 'min-h-11' : 'min-h-10', FOCUS)}>
              <span className={cn('shrink-0', compact ? 'w-[92px]' : 'w-24')}>{r.label}</span>
              <span aria-hidden="true" className="h-2.5 flex-1 rounded-[5px] bg-paper-deep">
                <span className="block h-2.5 rounded-[5px] bg-navy" style={{ width: `${Math.round((r.n / max) * 100)}%` }} />
              </span>
              <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{r.n}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function WaitingPanel({
  attention,
  preview,
  compact,
  now,
}: {
  attention: AttentionCounts
  preview: WaitingPreviewItem[]
  compact: boolean
  now: Date
}) {
  const total = waitingTotal(attention)
  const more = Math.max(0, total - preview.length)
  const items = preview.map((w) => {
    const Icon = ICON[w.kind]
    const copy = waitingCopy(w, now, peso)
    return { w, Icon, copy }
  })

  if (compact) {
    return (
      <section aria-label="Waiting for you" className="flex flex-col gap-3">
        {total === 0 ? (
          <AllCaughtUp compact />
        ) : (
          <>
            <Mix attention={attention} total={total} compact />
            <ul className="flex flex-col gap-2.5">
              {items.map(({ w, Icon, copy }) => (
                <li key={w.bookingId + w.kind} className="rounded-2xl border border-line bg-surface px-4 pb-3.5 pt-3">
                  <Link to={`/bookings/${w.bookingId}`} className={cn('flex gap-3 rounded-md text-ink no-underline', FOCUS)}>
                    <Icon size={24} strokeWidth={1.8} aria-hidden="true" className="mt-px shrink-0 text-navy" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold leading-snug">{w.subjectName}</span>
                      <span className={cn('block text-[13px] leading-snug', copy.tone === 'danger' ? 'text-danger' : 'text-status-pending-fg')}>{copy.status}</span>
                    </span>
                  </Link>
                  <Link to={`/bookings/${w.bookingId}`} className={cn(ACTION, 'mt-3 h-12 w-full rounded-xl text-[15px]', FOCUS)}>
                    {copy.action}
                  </Link>
                </li>
              ))}
            </ul>
            {more > 0 && (
              <Link to="/bookings?status=submitted" className={cn('flex min-h-12 items-center justify-center rounded-md text-[14px] font-semibold text-navy underline underline-offset-[3px]', FOCUS)}>
                Open the queue, {more} more
              </Link>
            )}
          </>
        )}
      </section>
    )
  }

  return (
    <section aria-label="Waiting for you" className="min-w-0 rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 px-6 pb-1 pt-5">
        <h2 className="font-display text-[22px] font-semibold text-navy">Waiting for you</h2>
        {total > 0 && (
          <Link to="/bookings?status=submitted" className={cn(ACTION, 'h-10 min-h-11 px-4 text-[14px] lg:min-h-0', FOCUS)}>
            Review next
          </Link>
        )}
      </div>
      {total === 0 ? (
        <AllCaughtUp compact={false} />
      ) : (
        <>
          <Mix attention={attention} total={total} compact={false} />
          <ul className="border-t border-line">
            {items.map(({ w, Icon, copy }) => (
              <li key={w.bookingId + w.kind} className="flex min-h-[68px] items-center gap-3.5 border-b border-line px-6 py-3">
                <Icon size={24} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-navy" />
                <Link to={`/bookings/${w.bookingId}`} className={cn('min-w-0 flex-1 rounded-md text-ink no-underline', FOCUS)}>
                  <span className="block text-[15px] font-semibold">{w.subjectName}</span>
                  <span className={cn('block text-[13px]', copy.tone === 'danger' ? 'text-danger' : 'text-status-pending-fg')}>{copy.status}</span>
                </Link>
                <Link to={`/bookings/${w.bookingId}`} className={cn(ACTION, 'h-10 min-h-11 min-w-[110px] px-4 text-[14px] lg:min-h-0', FOCUS)}>
                  {copy.action}
                </Link>
              </li>
            ))}
          </ul>
          {more > 0 && (
            <div className="px-6 py-1">
              <Link to="/bookings?status=submitted" className={cn('inline-flex min-h-11 items-center gap-1 rounded-md text-[14px] font-semibold text-navy underline underline-offset-[3px]', FOCUS)}>
                Open the queue, {more} more
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  )
}
