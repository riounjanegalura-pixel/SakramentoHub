import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../ui/button'
import { DiscardDraft } from './DiscardDraft'

/**
 * The fixed footer element the phone wizard draws through AppShell's `floating` slot (outside the animated main).
 * A step's footer is portalled into it; without one (desktop) the footer sits at the end of the step.
 */
export const WizardFooterSlot = createContext<HTMLElement | null>(null)

/** The footer element itself: fixed to the bottom above the safe area; `data-chrome` turns on the matching scroll padding. */
export function WizardFooterBar({ ref }: { ref: (el: HTMLDivElement | null) => void }) {
  return (
    <div
      ref={ref}
      data-chrome="wizard-footer"
      data-slot="wizard-footer"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[480px] border-t border-line bg-paper px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] empty:hidden"
    />
  )
}

interface BookingFormStepProps {
  children: ReactNode
  onCancel?: () => void
  /** Goes one step back, answers kept. Drawn beside Continue on a desktop; a phone has Back in its header. */
  onBack?: () => void
  onContinue: () => void
  /** Names the result of pressing it: "Next", or the submit label on the last step. */
  continueLabel?: string
  continueDisabled?: boolean
  /** A line shown above the buttons (e.g. why submitting failed). */
  footerNote?: ReactNode
}

/**
 * Body + footer for one wizard step (spec section 12). On a phone the footer is fixed at the bottom with one
 * Continue button (navy, the whole row, 56 px); the body is padded by `--wizard-footer` so the field in focus never
 * sits under it. `onCancel` discards the draft; it asks first, and is reached from the header on a phone.
 */
export function BookingFormStep({
  children,
  onCancel,
  onBack,
  onContinue,
  continueLabel = 'Next',
  continueDisabled = false,
  footerNote,
}: BookingFormStepProps) {
  const slot = useContext(WizardFooterSlot)

  // One primary button in the thumb zone. On a phone "Discard draft" lives in the header; on a desktop, where there
  // is no thumb zone, it sits quietly at the left of the same row.
  const footer = (
    <>
      {footerNote}
      <div className="flex gap-3 lg:justify-end">
        {onCancel && !slot && <DiscardDraft onDiscard={onCancel} className="mr-auto" />}
        {onBack && !slot && (
          <Button type="button" variant="outline" onClick={onBack} className="gap-1">
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Button>
        )}
        <Button type="button" onClick={onContinue} disabled={continueDisabled} className="flex-1 lg:min-w-48 lg:flex-none">
          {continueLabel}
        </Button>
      </div>
    </>
  )

  return (
    <div className="flex flex-1 flex-col">
      <div data-slot="wizard-step-body" className={slot ? 'flex-1 px-4 pt-6 pb-[var(--wizard-footer)]' : 'flex-1'}>
        {children}
      </div>
      {slot ? createPortal(footer, slot) : <div className="mt-8 border-t border-line pt-6">{footer}</div>}
    </div>
  )
}
