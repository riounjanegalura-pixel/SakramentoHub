import { get, type FieldErrors } from 'react-hook-form'

export function fieldError(errors: FieldErrors, path: string): string | undefined {
  const err = get(errors, path)
  return typeof err?.message === 'string' ? err.message : undefined
}
