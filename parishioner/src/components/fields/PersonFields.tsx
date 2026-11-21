import { useEffect } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'
import { FormField } from '../shared/FormField'
import { SelectField } from './SelectField'
import { AddressFields } from './AddressFields'
import { fieldError } from './fieldError'
import { CATHOLIC, CATHOLIC_ONLY, CIVIL_STATUS_LABEL, RELIGIONS, SUFFIXES, parishToday } from '../../lib/domain'
import { yearsBefore, type PersonOptions } from '../../lib/validation/groups'

/** An age as typed: whole digits only. Anything else ("e", "-", "1.5") is NaN, so the schema asks for the age again. */
export function ageValue(raw: unknown): number {
  const text = String(raw ?? '').trim()
  return /^\d{1,3}$/.test(text) ? Number(text) : Number.NaN
}

interface PersonFieldsProps {
  form: UseFormReturn<FieldValues>
  prefix: string
  options?: PersonOptions
  legend?: string
  lastNameLabel?: string
  /** False for a group that is only conditionally required (asterisks hidden). */
  required?: boolean
}

export function PersonFields({ form, prefix, options = {}, legend, lastNameLabel = 'Last name', required = true }: PersonFieldsProps) {
  const { register, formState, watch, getValues, setValue } = form
  const key = (k: string) => `${prefix}${k}`
  const err = (k: string) => fieldError(formState.errors, key(k))
  // Suffix (Jr., Sr., III) is for men only: by role when it is fixed, else by the sex answered on this form.
  const sex = options.fixedSex ?? (options.sex ? watch(key('Sex')) : undefined)
  const hasSuffix = sex === 'male'
  const religions = options.catholicOnly ? CATHOLIC_ONLY : RELIGIONS

  useEffect(() => {
    if (!hasSuffix && getValues(key('Suffix'))) setValue(key('Suffix'), '')
    if (options.catholicOnly && options.religion && !getValues(key('Religion'))) setValue(key('Religion'), CATHOLIC)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSuffix, options.catholicOnly, options.religion])

  return (
    <fieldset className="mb-2">
      {legend && <legend className="mb-3 text-sm font-semibold text-ink">{legend}</legend>}
      <FormField id={key('FirstName')} label="First name" required={required} {...register(key('FirstName'))} error={err('FirstName')} />
      <FormField id={key('MiddleName')} label="Middle name" optional {...register(key('MiddleName'))} error={err('MiddleName')} />
      <FormField id={key('LastName')} label={lastNameLabel} required={required} {...register(key('LastName'))} error={err('LastName')} />
      {hasSuffix && (
        <SelectField id={key('Suffix')} label="Suffix" optional blankLabel="N/A" options={SUFFIXES.map((s) => ({ value: s, label: s }))} {...register(key('Suffix'))} error={err('Suffix')} />
      )}
      {options.dob && (
        <FormField id={key('DateOfBirth')} type="date" label="Date of birth" required={required} max={yearsBefore(parishToday(), options.minAgeYears ?? 0)} {...register(key('DateOfBirth'))} error={err('DateOfBirth')} />
      )}
      {options.age && (
        <FormField id={key('Age')} inputMode="numeric" autoComplete="off" label="Age" required={required} {...register(key('Age'), { setValueAs: ageValue })} error={err('Age')} />
      )}
      {options.sex && (
        <SelectField
          id={key('Sex')}
          label="Sex"
          required={required}
          options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]}
          {...register(key('Sex'))}
          error={err('Sex')}
        />
      )}
      {options.placeOfBirth && (
        <AddressFields form={form} name={key('PlaceOfBirth')} label="Place of birth" required={required} withLine={false} />
      )}
      {options.citizenship && (
        <FormField id={key('Citizenship')} label="Citizenship" placeholder="e.g. Filipino" required={required} {...register(key('Citizenship'))} error={err('Citizenship')} />
      )}
      {options.religion && (
        <SelectField id={key('Religion')} label="Religion" required={required} options={religions.map((r) => ({ value: r, label: r }))} {...register(key('Religion'))} error={err('Religion')} />
      )}
      {options.civilStatus && (
        <SelectField
          id={key('CivilStatus')}
          label="Civil status"
          required={required}
          options={options.civilStatus.map((s) => ({ value: s, label: CIVIL_STATUS_LABEL[s] ?? s }))}
          {...register(key('CivilStatus'))}
          error={err('CivilStatus')}
        />
      )}
    </fieldset>
  )
}
