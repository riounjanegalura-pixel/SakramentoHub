import { journeyStages } from '../../features/booking/journeyStages'
import type { Booking } from '../../lib/types'
import { cn } from '../../lib/utils'

/**
 * The booking's own sequence in a line: the stage in words, "Step 2 of 5", five dots.
 * The full vertical rail stays on the booking page. No animation: the fill belongs to the full rail.
 */
export function JourneyRailCompact({ booking, className, onNavy = false }: { booking: Booking; className?: string; onNavy?: boolean }) {
  const { stages, outcomes } = journeyStages(booking)
  // Declined or cancelled: the outcome is the only thing worth saying.
  if (outcomes.length > 0) {
    return <p className={cn('text-label font-semibold', onNavy ? 'text-white' : 'text-danger', className)}>{outcomes[0].label}</p>
  }
  const current = stages.findIndex((s) => s.state === 'current')
  const index = current >= 0 ? current : Math.max(stages.map((s) => s.state).lastIndexOf('done'), 0)
  const label = stages[index]?.label ?? ''
  // On navy the rail is five bars the full width: filled white = done, gold = now, outlined = still to come.
  if (onNavy) {
    return (
      <div data-testid="compact-rail" className={cn('flex flex-col gap-2.5', className)}>
        <span aria-hidden="true" className="grid grid-cols-5 gap-1">
          {stages.map((s) => (
            <span
              key={s.key}
              data-node={s.state}
              className={cn(
                'h-1.5 rounded-sm',
                s.state === 'done' && 'bg-paper',
                s.state === 'current' && 'bg-gold',
                s.state === 'future' && 'border border-on-navy',
              )}
            />
          ))}
        </span>
        <p className="text-label text-on-navy">
          <span className="font-semibold text-white">Step {index + 1} of {stages.length}</span> · {label}
        </p>
      </div>
    )
  }
  return (
    <div data-testid="compact-rail" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {stages.map((s) => (
          <span
            key={s.key}
            data-node={s.state}
            className={cn(
              'size-3 rounded-full',
              s.state === 'done' && 'bg-navy',
              s.state === 'current' && 'border-2 border-navy bg-gold',
              s.state === 'future' && 'border-2 border-line bg-surface',
            )}
          />
        ))}
      </span>
      <p className="text-label text-ink">
        <span className="font-semibold">Step {index + 1} of {stages.length}</span> · {label}
      </p>
    </div>
  )
}
