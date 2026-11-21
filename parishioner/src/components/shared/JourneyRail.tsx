import { Check, RotateCcw, X } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import type { ReactNode } from 'react'
import { railFill } from '../../lib/motion'
import { cn } from '../../lib/utils'

export type JourneyStageKey = 'requested' | 'review' | 'paid' | 'confirmed' | 'completed'

export interface JourneyStage {
  key: JourneyStageKey
  label: string
  state: 'done' | 'current' | 'future'
  /** A short line under the label, e.g. "Changes requested". */
  note?: string
}

/** A terminal or off-path row after the stages: declined, cancelled, refund. */
export interface JourneyOutcome {
  key: string
  label: string
  tone: 'danger' | 'neutral'
}

interface JourneyRailProps {
  stages: JourneyStage[]
  /** The booking reference, shown under the rail in selectable mono numerals. */
  reference?: string
  outcomes?: JourneyOutcome[]
  className?: string
}

type NodeKind = JourneyStage['state'] | JourneyOutcome['tone']

const NODE_CLASS: Record<NodeKind, string> = {
  done: 'bg-navy text-white',
  current: 'border-[3px] border-navy bg-paper',
  future: 'border-2 border-hollow bg-transparent',
  danger: 'bg-danger text-white',
  neutral: 'border-2 border-ink-muted bg-surface text-ink-muted',
}

const SR_STATE: Record<NodeKind, string> = {
  done: ', done',
  current: '',
  future: ', to come',
  danger: '',
  neutral: '',
}

/**
 * The journey rail (spec sections 3, 5, 10): the booking's fixed sequence as a vertical list, one node per stage.
 * Done stages fill navy with a check; the current stage has a 2 px navy ring with a gold centre and the text
 * "Current step"; future stages stay hollow. On mount the nodes and the connecting line fill one stage at a time,
 * 90 ms apart (`railFill`), with transform only, so nothing is ever hidden; under reduced motion the final state
 * shows at once.
 */
export function JourneyRail({ stages, reference, outcomes = [], className }: JourneyRailProps) {
  const reduced = useReducedMotion() ?? false
  const rows: Array<{ key: string; kind: NodeKind; label: string; note?: string; stage: boolean }> = [
    ...stages.map((s) => ({ key: s.key, kind: s.state as NodeKind, label: s.label, note: s.note, stage: true })),
    ...outcomes.map((o) => ({ key: `outcome-${o.key}`, kind: o.tone as NodeKind, label: o.label, stage: false })),
  ]

  return (
    <div className={cn('min-w-0', className)}>
      <ol aria-label="Booking progress" className="flex flex-col">
        {rows.map((row, i) => {
          const last = i === rows.length - 1
          const isCurrent = row.kind === 'current'
          // The line below a node fills navy once that stage is done.
          const lineFilled = row.kind === 'done' && !last
          const fill = railFill(i).transition
          const node: ReactNode = (
            <>
              {row.kind === 'done' && <Check size={14} strokeWidth={3} aria-hidden="true" />}
              {row.kind === 'danger' && <X size={14} strokeWidth={3} aria-hidden="true" />}
              {row.kind === 'neutral' && <RotateCcw size={12} strokeWidth={2.5} aria-hidden="true" />}
              {isCurrent && <span data-centre aria-hidden="true" className="size-2.5 rounded-full bg-gold" />}
            </>
          )
          const nodeClass = cn('relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full', NODE_CLASS[row.kind])
          return (
            <li
              key={row.key}
              data-stage={row.stage ? row.key : undefined}
              data-outcome={row.stage ? undefined : row.key}
              aria-current={isCurrent ? 'step' : undefined}
              className="flex min-w-0 gap-3"
            >
              <span aria-hidden="true" className="flex w-7 shrink-0 flex-col items-center">
                {reduced ? (
                  <span data-node={row.kind} className={nodeClass}>{node}</span>
                ) : (
                  <m.span data-node={row.kind} className={nodeClass} initial={false} animate={{ scale: 1 }} transition={fill}>
                    {node}
                  </m.span>
                )}
                {!last && (
                  <span className={cn('relative my-1 block min-h-5 flex-1 overflow-hidden', lineFilled ? 'w-[3px] rounded-full bg-navy' : 'w-0 border-l-[3px] border-dashed border-hollow')}>
                    {lineFilled &&
                      (reduced ? (
                        <span data-line-fill className="absolute inset-0 bg-navy" />
                      ) : (
                        <m.span
                          data-line-fill
                          className="absolute inset-0 origin-top bg-navy"
                          initial={false}
                          animate={{ scaleY: 1 }}
                          transition={{ ...fill, delay: fill.delay + 0.045 }}
                        />
                      ))}
                  </span>
                )}
              </span>
              <span className={cn('min-w-0 flex-1 break-words', last ? 'pb-0' : 'pb-4')}>
                <span
                  className={cn(
                    'block text-body leading-7',
                    row.kind === 'future' && 'text-ink-muted',
                    row.kind === 'done' && 'text-ink',
                    isCurrent && 'font-semibold text-ink',
                    row.kind === 'danger' && 'font-semibold text-danger',
                    row.kind === 'neutral' && 'text-ink',
                  )}
                >
                  {row.label}
                </span>
                {SR_STATE[row.kind] && <span className="sr-only">{SR_STATE[row.kind]}</span>}
                {isCurrent && <span className="block text-label font-medium text-navy">Current step</span>}
                {row.note && <span className="mt-0.5 block text-note text-status-pending-fg">{row.note}</span>}
              </span>
            </li>
          )
        })}
      </ol>
      {reference && (
        <p className="mt-4 flex flex-wrap items-baseline gap-x-2 border-t border-dashed border-line pt-3 text-note text-ink-muted">
          Reference
          <span className="select-all font-mono tabular-nums text-ink">{reference}</span>
        </p>
      )}
    </div>
  )
}
