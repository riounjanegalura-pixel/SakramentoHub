import type { FieldValues, UseFormRegister } from 'react-hook-form'
import { cn } from '../../lib/utils'
import { useFieldErrorRole } from '../ui/field'

interface ChoiceCardsProps {
  name: string
  label: string
  options: ReadonlyArray<{ value: string; label: string; description?: string }>
  register: UseFormRegister<FieldValues>
  value: unknown
  error?: string
  columns?: 1 | 2
  /** Store "true"/"false" choices as real booleans. */
  boolean?: boolean
}

/** Radio choices drawn as cards. Native radios inside a named radiogroup, so arrow keys and screen readers work as
 * usual. Like `Field`: the legend says "Required" in words, the error is linked to the group and announced. */
export function ChoiceCards({ name, label, options, register, value, error, columns = 2, boolean = false }: ChoiceCardsProps) {
  const errorRole = useFieldErrorRole()
  const field = register(name)
  // react-hook-form ignores setValueAs for radios and checks a radio only when its value equals the
  // stored one, so a boolean choice hands RHF the boolean itself and is checked from `value`.
  const booleanProps = (optionValue: string) =>
    boolean
      ? {
          checked: String(value) === optionValue,
          onChange: () => field.onChange({ target: { name, value: optionValue === 'true' } }),
          // A real blur event would make RHF read the radio's string value back in.
          onBlur: () => field.onBlur({ target: { name, value }, type: 'blur' }),
        }
      : {}
  const legendId = `${name}-legend`
  const errorId = `${name}-error`

  return (
    <fieldset
      role="radiogroup"
      aria-labelledby={legendId}
      aria-required="true"
      aria-invalid={!!error}
      aria-describedby={error ? errorId : undefined}
      className="mb-4"
    >
      <legend id={legendId} className="mb-2 flex flex-wrap items-baseline gap-2 text-sm font-medium text-ink">
        <span>{label}</span>
        <span className="text-label font-normal text-ink-muted">Required</span>
      </legend>
      <div className={cn('grid gap-3', columns === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex min-h-[44px] cursor-pointer flex-col rounded-2xl border bg-surface p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus',
              String(value) === o.value ? 'border-navy ring-1 ring-navy' : error ? 'border-danger' : 'border-line',
            )}
          >
            <span className="flex items-center gap-2">
              <input type="radio" value={o.value} {...field} {...booleanProps(o.value)} className="size-4 accent-navy" />
              <span className="font-medium text-ink">{o.label}</span>
            </span>
            {o.description && <span className="mt-1 text-label text-ink-muted">{o.description}</span>}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} role={errorRole} className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}
