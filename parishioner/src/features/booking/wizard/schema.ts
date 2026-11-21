import { z } from 'zod'
import type { WizardDefinition, WizardStep } from './types'

/** looseObject: a step's refine can read answers from earlier steps, and parsing keeps them. */
export function stepSchema(step: WizardStep) {
  return z.looseObject(step.shape ?? {}).superRefine((data, ctx) => step.refine?.(data, ctx))
}

export function fullSchema(definition: WizardDefinition) {
  const shape: z.ZodRawShape = Object.assign({}, ...definition.steps.map((s) => s.shape ?? {}))
  return z.looseObject(shape).superRefine((data, ctx) => {
    for (const step of definition.steps) step.refine?.(data, ctx)
  })
}

/** Index of the step whose shape owns a form-data key ("sponsors.0.age" → the sponsors step). */
export function stepIndexForKey(definition: WizardDefinition, key: string): number {
  const root = key.split('.')[0]
  const index = definition.steps.findIndex((s) => s.shape && root in s.shape)
  return index === -1 ? 0 : index
}
