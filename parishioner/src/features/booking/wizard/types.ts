import type { ComponentType } from 'react'
import type { z } from 'zod'
import type { Sacrament, User } from '../../../lib/types'
import type { FormValues } from '../../../lib/validation/groups'

export interface WizardStep {
  id: string
  title: string
  /** A title that depends on the answers so far (baptism: "Child" or "Adult"); falls back to `title`. */
  titleFor?: (data: FormValues) => string
  /** Zod shape for this step's own fields (merged into the full schema). */
  shape?: z.ZodRawShape
  /** Cross-field rules; receives every answer so far. */
  refine?: (data: FormValues, ctx: z.RefinementCtx) => void
  Component: ComponentType<{ step: WizardStep }>
  /** Rows shown on Review & Submit; omit for steps with nothing to show. */
  review?: (data: FormValues) => Array<[string, string]>
  /** Keys that the answers made irrelevant (a toggle hid their fields). Saving the step drops them from the draft. */
  clears?: (data: FormValues) => string[]
}

export interface WizardDefinition {
  sacrament: Sacrament
  /** Review & Submit is appended automatically. */
  steps: WizardStep[]
  /** "What to prepare / bring" — shown on Review & Submit. */
  prepare: string[]
  /** Answers filled from the account when booking for oneself (only into empty fields). */
  prefillSelf?: (user: User) => FormValues
  /** Answers that change which dates/times are offered (e.g. funeral `massType`).
   * Saving a step that changes any of them clears the chosen date and time. */
  scheduleKeys?: string[]
}
