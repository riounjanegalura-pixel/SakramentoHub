import { useEffect } from 'react'
import { useFieldArray, type FieldValues, type UseFormReturn } from 'react-hook-form'
import { Plus, X } from 'lucide-react'
import { FormField } from '../shared/FormField'
import { SelectField } from './SelectField'
import { AddressFields } from './AddressFields'
import { fieldError } from './fieldError'
import { CATHOLIC, RELIGIONS } from '../../lib/domain'
import { ageValue } from './PersonFields'
import { useFieldErrorRole } from '../ui/field'

interface SponsorFieldsProps {
  form: UseFormReturn<FieldValues>
  min: number
  max: number
  minAge: number
  hint?: string
}

const EMPTY_SPONSOR = { role: '', firstName: '', middleName: '', lastName: '', religion: CATHOLIC, residence: '', residenceLine: '' }

/** One sponsor card per entry, identical everywhere (client note: "same fields always"). */
export function SponsorFields({ form, min, max, hint }: SponsorFieldsProps) {
  const errorRole = useFieldErrorRole()
  const { control, register, formState } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'sponsors' })
  const err = (path: string) => fieldError(formState.errors, path)
  const listError = err('sponsors') ?? err('sponsors.root')

  useEffect(() => {
    if (fields.length < min) {
      for (let i = fields.length; i < min; i++) append({ ...EMPTY_SPONSOR })
    }
  }, [fields.length, min, append])

  return (
    <div>
      {hint && <p className="mb-3 text-sm text-ink-muted">{hint}</p>}
      {/* A rule about the whole list: the resolver files it under `sponsors.root` once sponsor fields are registered. */}
      {listError && (
        <p role={errorRole} className="mb-3 text-sm font-medium text-danger">
          {listError}
        </p>
      )}

      {fields.map((field, i) => {
        const base = `sponsors.${i}`
        return (
          <fieldset key={field.id} aria-label={`Sponsor ${i + 1}`} className="mb-4 rounded-xl border border-line bg-surface p-4">
            <legend className="float-left mb-3 font-semibold text-ink">Sponsor {i + 1}</legend>
            {fields.length > min && (
              <button
                type="button"
                aria-label={`Remove sponsor ${i + 1}`}
                onClick={() => remove(i)}
                className="float-right flex size-11 items-center justify-center rounded-full bg-paper text-ink-muted"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
            <div className="clear-both" />
            <SelectField
              id={`${base}.role`}
              label="Role"
              required
              options={[{ value: 'ninong', label: 'Ninong (godfather)' }, { value: 'ninang', label: 'Ninang (godmother)' }]}
              {...register(`${base}.role`)}
              error={err(`${base}.role`)}
            />
            <FormField id={`${base}.firstName`} label="First name" required {...register(`${base}.firstName`)} error={err(`${base}.firstName`)} />
            <FormField id={`${base}.middleName`} label="Middle name" {...register(`${base}.middleName`)} error={err(`${base}.middleName`)} />
            <FormField id={`${base}.lastName`} label="Last name" required {...register(`${base}.lastName`)} error={err(`${base}.lastName`)} />
            <FormField
              id={`${base}.age`}
              inputMode="numeric"
              autoComplete="off"
              label="Age"
              required
              {...register(`${base}.age`, { setValueAs: ageValue })}
              error={err(`${base}.age`)}
            />
            <SelectField
              id={`${base}.religion`}
              label="Religion"
              required
              options={RELIGIONS.map((r) => ({ value: r, label: r }))}
              {...register(`${base}.religion`)}
              error={err(`${base}.religion`)}
            />
            <AddressFields form={form} name={`${base}.residence`} label="Residence" required={false} />
          </fieldset>
        )
      })}

      {fields.length < max && (
        <button
          type="button"
          onClick={() => append({ ...EMPTY_SPONSOR })}
          className="flex min-h-[44px] items-center gap-1 rounded-full bg-paper px-4 py-2 text-sm font-medium text-navy"
        >
          <Plus size={14} aria-hidden="true" /> Add sponsor
        </button>
      )}
    </div>
  )
}
