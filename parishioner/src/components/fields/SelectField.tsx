import { forwardRef, type SelectHTMLAttributes } from 'react'
import { Field } from '../ui/field'

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
  required?: boolean
  optional?: boolean
  error?: string
  /** Makes the empty choice a real answer (for example "N/A") instead of a disabled prompt. */
  blankLabel?: string
}

/** A native select on `Field`: visible label, "Required" in words, error linked and announced (spec section 10). */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { id, label, options, required, optional, error, blankLabel, ...rest },
  ref,
) {
  return (
    <Field id={id} label={label} error={error} required={required} optional={optional} className="mb-4">
      <select
        ref={ref}
        aria-required={required || undefined}
        className="min-h-[44px] w-full rounded-xl border border-input-border bg-surface px-3 py-2 text-base text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger md:text-sm"
        defaultValue=""
        {...rest}
      >
        <option value="" disabled={!blankLabel}>
          {blankLabel ?? 'Select…'}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
})
