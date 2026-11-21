import type { ServerFieldError } from '../../../stores/server-errors-store'
import type { WizardStep } from './types'

export interface GroupedServerErrors {
  byStep: Record<string, ServerFieldError[]>
  /** Index (0-based, into `steps`) of the earliest failing step; -1 when nothing could be placed. */
  firstIndex: number
  /** Messages for keys no step owns. */
  unplaced: string[]
}

function owner(steps: WizardStep[], key: string): { index: number; path: string } {
  if (key === 'appointmentDate' || key === 'appointmentStart') return { index: steps.findIndex((s) => s.id === 'schedule'), path: key }
  if (key === 'linkUserId' || key === 'contact' || key.startsWith('contact.')) return { index: steps.findIndex((s) => s.id === 'contact'), path: key }
  if (key.startsWith('formData.')) {
    const path = key.slice('formData.'.length)
    const root = path.split('.')[0]
    return { index: steps.findIndex((s) => !!s.shape && root in s.shape), path }
  }
  return { index: -1, path: key }
}

/** Laravel's 422 `errors` object → the wizard step that owns each field. */
export function groupServerErrors(steps: WizardStep[], errors: Record<string, string[]>): GroupedServerErrors {
  const byStep: Record<string, ServerFieldError[]> = {}
  const unplaced: string[] = []
  let firstIndex = -1
  for (const [key, messages] of Object.entries(errors)) {
    const { index, path } = owner(steps, key)
    if (index === -1) {
      unplaced.push(...messages)
      continue
    }
    const id = steps[index].id
    byStep[id] = [...(byStep[id] ?? []), ...messages.map((message) => ({ path, message }))]
    if (firstIndex === -1 || index < firstIndex) firstIndex = index
  }
  return { byStep, firstIndex, unplaced }
}
