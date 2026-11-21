import type { ComponentProps, ReactNode } from 'react'
import { Field } from '../ui/field'
import { Input } from '../ui/input'

interface FormFieldProps extends ComponentProps<'input'> {
  id: string
  label: string
  error?: string
  /** A hint shown under the label and linked to the input (e.g. "e.g. March 1998"). */
  description?: ReactNode
  required?: boolean
  /** Prints "Optional" next to the label. */
  optional?: boolean
}

/**
 * One labelled input with its error message, built on `Field` (spec section 10): a visible label, "Required" in
 * words, the error linked by aria-describedby with aria-invalid, and announced (role="alert"). Every step in every
 * sacrament's wizard is built from this, so they all inherit it.
 */
export function FormField({ label, error, description, required, optional, id, className, ...rest }: FormFieldProps) {
  return (
    <Field id={id} label={label} error={error} description={description} required={required} optional={optional} className={className ?? 'mb-4'}>
      <Input aria-required={required || undefined} {...rest} />
    </Field>
  )
}
