import { z } from 'zod'
import { FormField } from '../../../components/shared/FormField'
import { AddressFields } from '../../../components/fields/AddressFields'
import { BLESSING_CITY_CODES, BULACAN_PROVINCE_CODE, REGION_III_CODE } from '../../../lib/api/psgc'
import { ChoiceCards } from '../../../components/fields/ChoiceCards'
import { fieldError } from '../../../components/fields/fieldError'
import { addressKeys, addressShape, loose, refineWith } from '../../../lib/validation/groups'
import { bookingForStep } from '../wizard/BookingForStep'
import { scheduleStep } from '../wizard/ScheduleStep'
import { StepFrame } from '../wizard/StepFrame'
import { useStepForm } from '../wizard/useStepForm'
import { addressText, rows } from '../wizard/review'
import { addressFromProfile } from '../wizard/profilePrefill'
import type { WizardDefinition, WizardStep } from '../wizard/types'

const PROPERTY_TYPES = [
  { value: 'house', label: 'House' },
  { value: 'business', label: 'Business / office' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'other', label: 'Other' },
] as const

const PLATE = /^[A-Za-z0-9 -]{3,10}$/

const propertyStep: WizardStep = {
  id: 'property',
  title: 'Property',
  shape: {
    propertyType: z.enum(['house', 'business', 'vehicle', 'other'], { error: 'Choose what will be blessed' }),
    // A person or a business ("7-Eleven Balagtas", "R&J Trading"): general text, not the person-name pattern.
    propertyOwner: z.string({ error: "Enter the owner's name" }).trim().min(1, "Enter the owner's name").max(120),
    ...loose(addressShape('propertyAddress')),
    vehiclePlate: z.string().nullish(),
    propertyDescription: z.string().max(255).nullish(),
    occasion: z.string().max(120).nullish(),
  },
  refine: (d, ctx) => {
    if (d.propertyType && d.propertyType !== 'vehicle') refineWith(ctx, z.looseObject(addressShape('propertyAddress')), d)
    if (d.propertyType === 'vehicle' && !PLATE.test(String(d.vehiclePlate ?? ''))) {
      ctx.addIssue({ code: 'custom', path: ['vehiclePlate'], message: 'Enter the plate number (e.g. NBC 1234)' })
    }
    if (d.propertyType === 'other' && !String(d.propertyDescription ?? '').trim()) {
      ctx.addIssue({ code: 'custom', path: ['propertyDescription'], message: 'Describe what will be blessed' })
    }
  },
  clears: (d) => {
    if (!d.propertyType) return []
    return [
      ...(d.propertyType === 'vehicle' ? addressKeys('propertyAddress') : ['vehiclePlate']),
      ...(d.propertyType === 'other' ? [] : ['propertyDescription']),
    ]
  },
  Component: PropertyView,
  review: (d) =>
    rows([
      ['Property', PROPERTY_TYPES.find((t) => t.value === d.propertyType)?.label],
      ['Owner', d.propertyOwner],
      ['Address', d.propertyType === 'vehicle' ? undefined : addressText(d, 'propertyAddress')],
      ['Plate no.', d.propertyType === 'vehicle' ? d.vehiclePlate : undefined],
      ['Description', d.propertyType === 'other' ? d.propertyDescription : undefined],
      ['Occasion', d.occasion],
    ]),
}

function PropertyView({ step }: { step: WizardStep }) {
  const { form, onContinue } = useStepForm(step)
  const type = form.watch('propertyType')
  const err = (k: string) => fieldError(form.formState.errors, k)

  return (
    <StepFrame onContinue={onContinue}>
      <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">What will be blessed?</h2>
      <ChoiceCards name="propertyType" label="Property" register={form.register} value={type} options={PROPERTY_TYPES} error={err('propertyType')} />
      <FormField id="propertyOwner" label="Owner's full name" required {...form.register('propertyOwner')} error={err('propertyOwner')} />
      {type === 'vehicle' && (
        <FormField id="vehiclePlate" label="Plate number" required placeholder="NBC 1234" {...form.register('vehiclePlate')} error={err('vehiclePlate')} />
      )}
      {type && type !== 'vehicle' && <AddressFields form={form} name="propertyAddress" label="Property address" fixedPlace={{ regionCode: REGION_III_CODE, provinceCode: BULACAN_PROVINCE_CODE }} cityCodes={BLESSING_CITY_CODES} />}
      {type === 'other' && (
        <FormField id="propertyDescription" label="What will be blessed?" required {...form.register('propertyDescription')} error={err('propertyDescription')} />
      )}
      <FormField id="occasion" label="Occasion" optional placeholder="e.g. Moving in, anniversary, thanksgiving" {...form.register('occasion')} />
    </StepFrame>
  )
}

export const houseBlessingWizard: WizardDefinition = {
  sacrament: 'house-blessing',
  steps: [scheduleStep(), bookingForStep('house-blessing'), propertyStep],
  prepare: [
    'A small table with a clean cloth',
    'A crucifix and candles',
    'A container of water to be blessed (the priest brings holy water)',
    'For the priest: a chair and an electric fan',
  ],
  prefillSelf: (user) => ({ propertyOwner: user.fullName, ...addressFromProfile(user, 'propertyAddress') }),
  // Every house blessing is an off-site rite of the same length; what is blessed
  // does not change which times are offered.
  scheduleKeys: [],
}
