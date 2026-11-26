import { ChevronLeft } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { durations, ease } from '../../lib/motion'
import { cn } from '../../lib/utils'
import { DiscardDraft } from './DiscardDraft'

interface WizardProgressProps {
  /** Step names in order. */
  steps: string[]
  /** 1-based index of the step on screen. */
  current: number
  /** 'compact' (phone): only the current name is visible, the others are for screen readers. 'full' (desktop): every name shows. */
  variant?: 'compact' | 'full'
  /** Earlier steps become buttons that jump back to them (desktop). */
  onJump?: (n: number) => void
  /** Accessible name of the list; omit when a surrounding landmark already names it. */
  label?: string
}

/**
 * Segmented progress (spec section 12): one segment per step, its name in text. Completed segments are navy;
 * the current one fills from the left as its step opens (a transform animation, so it stays smooth while the next page loads);
 * under reduced motion it simply appears in place.
 */
export function WizardProgress({ steps, current, variant = 'compact', onJump, label }: WizardProgressProps) {
  const reduced = useReducedMotion() ?? false
  const full = variant === 'full'

  return (
    <ol aria-label={label} className={cn('flex gap-1.5', full && 'gap-2')}>
      {steps.map((name, i) => {
        const n = i + 1
        const state = n < current ? 'done' : n === current ? 'current' : 'upcoming'
        const isCurrent = state === 'current'
        const segment = (
          <span
            data-segment={state}
            aria-hidden="true"
            className={cn(
              'relative block h-1.5 w-full overflow-hidden rounded-full',
              state === 'done' ? 'bg-navy' : 'border-[1.5px] border-hollow',
            )}
          >
            {isCurrent &&
              (reduced ? (
                <span data-active className="absolute inset-0 rounded-full bg-navy" />
              ) : (
                // The fill grows from the left as the step opens. A `transform` string runs off the main thread in every
                // Motion version, so it stays smooth while the next step is loading (a layout animation would not).
                <m.span
                  data-active
                  data-progress-fill="wizard-progress"
                  initial={{ transform: 'scaleX(0)' }}
                  animate={{ transform: 'scaleX(1)' }}
                  transition={{ duration: durations.base, ease: [...ease] }}
                  className="absolute inset-0 origin-left bg-navy"
                />
              ))}
          </span>
        )
        // Phone: only the current name is shown; desktop shows them all. Every name reaches a screen reader.
        const nameClass = cn(
          'mt-1.5 block text-label leading-tight',
          full ? '' : 'sr-only',
          isCurrent ? 'font-semibold text-ink' : 'text-ink-muted',
        )
        const text = (
          <>
            {segment}
            <span className={nameClass}>{name}</span>
            {state === 'done' && <span className="sr-only">, done</span>}
          </>
        )
        return (
          // On a phone the current segment is wider so its name fits under it; the gold segment grows into it as it moves.
          <li key={`${n}-${name}`} aria-current={isCurrent ? 'step' : undefined} className="min-w-0 flex-1">
            {state === 'done' && onJump ? (
              <button
                type="button"
                onClick={() => onJump(n)}
                // A button centers its content vertically; top-align it so the bar sits level with the steps that are not buttons.
                className="flex min-h-[44px] w-full flex-col justify-start rounded-md text-left outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus"
              >
                {text}
              </button>
            ) : (
              text
            )}
          </li>
        )
      })}
    </ol>
  )
}

interface StepperHeaderProps {
  title: string
  /** Step names in order; their count is the total. */
  steps: string[]
  currentStep: number
  onBack: () => void
  /** Throws the draft away (after asking). Shown in the header, away from the Continue button. */
  onDiscard?: () => void
}

/** Phone wizard header: back control, sacrament title, the segmented progress and "Step N of M · name". */
export function StepperHeader({ title, steps, currentStep, onBack, onDiscard }: StepperHeaderProps) {
  return (
    <div className="border-b border-line bg-paper px-4 pb-3 pt-2">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="flex size-12 shrink-0 items-center justify-center rounded-full text-navy outline-none hover:bg-line/40 focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <h1 className="min-w-[8rem] flex-1 text-body font-semibold text-ink [overflow-wrap:anywhere]">{title}</h1>
        {onDiscard && <DiscardDraft onDiscard={onDiscard} className="shrink-0" />}
      </div>
      <WizardProgress steps={steps} current={currentStep} label="Booking steps" />
      <p className="mt-2 text-note text-ink">
        <span className="font-semibold">Step {currentStep} of {steps.length}</span> · {steps[currentStep - 1]}
      </p>
    </div>
  )
}
