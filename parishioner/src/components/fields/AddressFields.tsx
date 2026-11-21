import type { FieldValues, UseFormReturn } from 'react-hook-form'
import { CascadingAddressPicker } from '../shared/CascadingAddressPicker'
import { FormField } from '../shared/FormField'
import { bindPsgcField } from '../../lib/validation/psgc'
import { fieldError } from './fieldError'

interface AddressFieldsProps {
  form: UseFormReturn<FieldValues>
  name: string
  label: string
  required?: boolean
  withLine?: boolean
  lineLabel?: string
  /** Offer only these regions; used where the priest has to travel to the address. */
  regionCodes?: string[]
  /** Preset region and province (hidden), offering only `cityCodes` as towns. */
  fixedPlace?: { regionCode: string; provinceCode: string }
  cityCodes?: string[]
}

export function AddressFields({ form, name, label, required = true, withLine = true, lineLabel = 'House no. / street (optional)', regionCodes, fixedPlace, cityCodes }: AddressFieldsProps) {
  const { watch, setValue, register, formState } = form

  return (
    <>
      <CascadingAddressPicker
        id={name}
        label={label}
        required={required}
        regionCodes={regionCodes}
        fixedPlace={fixedPlace}
        cityCodes={cityCodes}
        {...bindPsgcField({ watch, setValue }, name)}
        error={fieldError(formState.errors, name)}
      />
      {withLine && (
        <FormField id={`${name}Line`} label={lineLabel} placeholder="e.g. 123 Mabini St." {...register(`${name}Line`)} />
      )}
    </>
  )
}
