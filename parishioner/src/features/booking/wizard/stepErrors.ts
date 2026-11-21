import { create } from 'zustand'
import type { FieldErrors } from 'react-hook-form'

export interface StepFieldError {
  /** Field path inside the step's answers ("childFirstName", "sponsors.0.age"). */
  path: string
  message: string
}

export interface StepErrorReport {
  errors: StepFieldError[]
  /** Times Continue has run validation on this step (react-hook-form's submitCount). */
  submitCount: number
}

interface StepErrorsState {
  byStep: Record<string, StepErrorReport>
  report: (stepId: string, report: StepErrorReport) => void
  clear: (stepId: string) => void
}

/**
 * The validation errors of the step on screen, published by `useStepForm` so the shared `StepFrame` can show the
 * error summary and move focus without every sacrament form passing its form down. Not persisted.
 */
export const useStepErrorsStore = create<StepErrorsState>((set) => ({
  byStep: {},
  report: (stepId, report) => set((s) => ({ byStep: { ...s.byStep, [stepId]: report } })),
  clear: (stepId) =>
    set((s) => {
      if (!(stepId in s.byStep)) return s
      const { [stepId]: _removed, ...rest } = s.byStep
      return { byStep: rest }
    }),
}))

/** react-hook-form's nested errors object → one entry per message, in the order the form holds them. */
export function flattenErrors(errors: FieldErrors, prefix = ''): StepFieldError[] {
  const out: StepFieldError[] = []
  for (const [key, value] of Object.entries(errors)) {
    if (!value || typeof value !== 'object' || key === 'ref') continue
    const path = prefix ? `${prefix}.${key}` : key
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string' && message !== '') out.push({ path, message })
    for (const [childKey, child] of Object.entries(value)) {
      if (childKey === 'ref' || childKey === 'message' || childKey === 'type' || childKey === 'types') continue
      if (child && typeof child === 'object') out.push(...flattenErrors({ [childKey]: child } as FieldErrors, path))
    }
  }
  return out
}
