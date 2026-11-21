import { createContext, useContext } from 'react'
import type { WizardDefinition, WizardStep } from './types'

export interface WizardContextValue {
  definition: WizardDefinition
  stepIndex: number
  total: number
  next: () => void
  goTo: (step1Based: number) => void
  cancel: () => void
  /** One step back (the first step leaves the wizard). */
  back?: () => void
  /** A step registers a function saving its current answers (no validation); null on unmount. */
  /** True once the wizard was cancelled: nothing more may be saved from the step. */
  draftDiscarded?: () => boolean
  registerDraft?: (commit: (() => void) | null) => void
  /** 'desk' = office walk-in entry; absent means the normal parishioner flow. */
  mode?: 'online' | 'desk'
  /** The steps this run shows (the desk swaps step 1); absent means `definition.steps`. */
  steps?: WizardStep[]
  /** Id of the step on screen. */
  stepId?: string
}

export const WizardContext = createContext<WizardContextValue | null>(null)

export function useWizard(): WizardContextValue {
  const value = useContext(WizardContext)
  if (!value) throw new Error('useWizard must be used inside <BookingWizard>')
  return value
}

export function stepsOf(ctx: WizardContextValue): WizardStep[] {
  return ctx.steps ?? ctx.definition.steps
}
