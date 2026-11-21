// parishioner/src/features/booking/baptism/definition.tsx
import { useState } from 'react'
import { z } from 'zod'
import { FormField } from '../../../components/shared/FormField'
import { AddressFields } from '../../../components/fields/AddressFields'
import { ChoiceCards } from '../../../components/fields/ChoiceCards'
import { SectionTabs } from '../../../components/shared/SectionTabs'
import { PersonFields } from '../../../components/fields/PersonFields'
import { SelectField } from '../../../components/fields/SelectField'
import { fieldError } from '../../../components/fields/fieldError'
import { CATHOLIC_ONLY, OMIT_REASONS, parishToday } from '../../../lib/domain'
import { addressShape, loose, pastDate, personKeys, personShape, refineWith, yearsBefore } from '../../../lib/validation/groups'
import { bookingForStep } from '../wizard/BookingForStep'
import { scheduleStep } from '../wizard/ScheduleStep'
import { documentsStep } from '../wizard/DocumentsStep'
import { sponsorsStep } from '../wizard/SponsorsStep'
import { StepFrame } from '../wizard/StepFrame'
import { useStepForm } from '../wizard/useStepForm'
import { addressText, personName, rows, splitName } from '../wizard/review'
import { parentFromProfile } from '../wizard/profilePrefill'
import { useAuthStore } from '../../../stores/auth-store'
import { Button } from '../../../components/ui/button'
import type { FormValues } from '../../../lib/validation/groups'
import type { WizardDefinition, WizardStep } from '../wizard/types'

const religion = z.enum(CATHOLIC_ONLY, { error: 'Select the religion' })
const fatherStrict = z.looseObject({ ...personShape('father', { placeOfBirth: true }), fatherReligion: religion })
const motherStrict = z.looseObject({ ...personShape('mother', { placeOfBirth: true }), motherReligion: religion })
const PARENT_OPTIONS = { placeOfBirth: true } as const
/** Every draft key a parent's group can hold, including the religion that sits beside it. */
const parentKeys = (p: 'father' | 'mother') => [...personKeys(p, PARENT_OPTIONS), `${p}Religion`]

const MARRIAGE = [
  { value: 'catholic', label: 'Married in the Catholic Church' },
  { value: 'civil', label: 'Civil marriage only' },
  { value: 'not_married', label: 'Not married' },
] as const

/** The person being baptized is a child or an adult by the date of birth; until it is entered, the neutral name. */
export function baptizeeTitle(d: FormValues): string {
  const dob = d.childDateOfBirth
  if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return 'Person to be baptized'
  return dob <= yearsBefore(parishToday(), 18) ? 'Adult' : 'Child'
}

const childStep: WizardStep = {
  id: 'child',
  title: 'Person to be baptized',
  titleFor: baptizeeTitle,
  shape: personShape('child', { dob: true, placeOfBirth: true, sex: true }),
  Component: function ChildView({ step }) {
    const { form, onContinue } = useStepForm(step)
    return (
      <StepFrame onContinue={onContinue}>
        <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">Who is being baptized?</h2>
        <PersonFields form={form} prefix="child" options={{ dob: true, placeOfBirth: true, sex: true }} />
      </StepFrame>
    )
  },
  review: (d) =>
    rows([
      ['Name', personName(d, 'child')],
      ['Date of birth', d.childDateOfBirth],
      ['Place of birth', d.childPlaceOfBirth],
      ['Sex', d.childSex === 'male' ? 'Male' : d.childSex === 'female' ? 'Female' : undefined],
    ]),
}

const parentsStep: WizardStep = {
  id: 'parents',
  title: 'Parents',
  shape: {
    fatherOmitted: z.boolean().nullish(),
    fatherOmittedReason: z.string().max(255).nullish(),
    ...loose(personShape('father', { placeOfBirth: true })),
    fatherReligion: z.any().optional(),
    motherOmitted: z.boolean().nullish(),
    motherOmittedReason: z.string().max(255).nullish(),
    ...loose(personShape('mother', { placeOfBirth: true })),
    motherReligion: z.any().optional(),
    ...addressShape('parentsResidence'),
  },
  refine: (d, ctx) => {
    if (d.fatherOmitted === true) {
      if (!String(d.fatherOmittedReason ?? '').trim()) {
        ctx.addIssue({ code: 'custom', path: ['fatherOmittedReason'], message: "Tell us briefly why the father's details are left out" })
      }
    } else {
      refineWith(ctx, fatherStrict, d)
    }
    if (d.motherOmitted === true) {
      if (!String(d.motherOmittedReason ?? '').trim()) {
        ctx.addIssue({ code: 'custom', path: ['motherOmittedReason'], message: "Tell us briefly why the mother's details are left out" })
      }
    } else {
      refineWith(ctx, motherStrict, d)
    }
  },
  clears: (d) => [
    ...(d.fatherOmitted === true ? parentKeys('father') : ['fatherOmittedReason']),
    ...(d.motherOmitted === true ? parentKeys('mother') : ['motherOmittedReason']),
  ],
  Component: function ParentsView({ step }) {
    const { form, onContinue } = useStepForm(step)
    const omitted = form.watch('fatherOmitted') === true
    const motherOmitted = form.watch('motherOmitted') === true
    const err = (k: string) => fieldError(form.formState.errors, k)
    const reasonOptions = OMIT_REASONS.map((r) => ({ value: r, label: r }))
    const { getValues, setValue } = form
    const user = useAuthStore((s) => s.user)
    const [filledAs, setFilledAs] = useState<'father' | 'mother' | null>(null)
    // A deliberate tap, never a guess: it fills only the blanks, so nothing already typed is overwritten.
    const fillFromProfile = (who: 'father' | 'mother') => {
      if (!user) return
      for (const [k, v] of Object.entries(parentFromProfile(user, who, splitName))) {
        if (v !== undefined && v !== '' && !getValues(k)) setValue(k, v, { shouldDirty: true })
      }
      if (who === 'father') setValue('fatherOmitted', false)
      else setValue('motherOmitted', false)
      setFilledAs(who)
    }
    const roles: Array<'father' | 'mother'> = user?.sex === 'male' ? ['father'] : user?.sex === 'female' ? ['mother'] : ['father', 'mother']
    const parentOptions = { placeOfBirth: true, religion: true, catholicOnly: true } as const
    const errorKeys = Object.keys(form.formState.errors)
    const errIn = (...prefixes: string[]) => errorKeys.some((k) => prefixes.some((p) => k.startsWith(p)))
    return (
      <StepFrame onContinue={onContinue}>
        <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">Parents</h2>
        {user && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {roles.map((who) => (
              <Button key={who} type="button" variant="outline" size="sm" onClick={() => fillFromProfile(who)}>
                Use my details as the {who}
              </Button>
            ))}
            {filledAs && <p role="status" className="text-sm text-ink-muted">Filled in from your profile. Check the {filledAs}'s tab and change anything that is not right.</p>}
          </div>
        )}
        {err('motherOmitted') && <p role="alert" className="mb-3 text-sm font-medium text-danger">{err('motherOmitted')}</p>}
        <SectionTabs
          label="Parents"
          tabs={[
            {
              id: 'father',
              label: 'Father',
              hasError: errIn('father'),
              content: (
                <>
                  <label htmlFor="fatherOmitted" className="mb-3 flex min-h-11 items-center gap-3 text-body text-ink">
                    <input id="fatherOmitted" type="checkbox" className="size-6 shrink-0" {...form.register('fatherOmitted')} />
                    Leave out the father's details
                  </label>
                  {omitted ? (
                    <SelectField id="fatherOmittedReason" label="Reason" required options={reasonOptions} {...form.register('fatherOmittedReason')} error={err('fatherOmittedReason')} />
                  ) : (
                    <PersonFields form={form} prefix="father" legend="Father" options={{ ...parentOptions, fixedSex: 'male' }} />
                  )}
                </>
              ),
            },
            {
              id: 'mother',
              label: 'Mother',
              hasError: errIn('mother'),
              content: (
                <>
                  <label htmlFor="motherOmitted" className="mb-3 flex min-h-11 items-center gap-3 text-body text-ink">
                    <input id="motherOmitted" type="checkbox" className="size-6 shrink-0" {...form.register('motherOmitted')} />
                    Leave out the mother's details
                  </label>
                  {motherOmitted ? (
                    <SelectField id="motherOmittedReason" label="Reason" required options={reasonOptions} {...form.register('motherOmittedReason')} error={err('motherOmittedReason')} />
                  ) : (
                    <PersonFields form={form} prefix="mother" legend="Mother" options={{ ...parentOptions, fixedSex: 'female' }} lastNameLabel="Maiden last name" />
                  )}
                </>
              ),
            },
            {
              id: 'residence',
              label: 'Family residence',
              hasError: errIn('parentsResidence'),
              content: <AddressFields form={form} name="parentsResidence" label="Family residence" />,
            },
          ]}
        />
      </StepFrame>
    )
  },
  review: (d) => {
    const omitted = d.fatherOmitted === true
    const motherOmitted = d.motherOmitted === true
    return rows([
      ['Father', omitted ? `Not included (${d.fatherOmittedReason ?? ''})` : personName(d, 'father')],
      ["Father's place of birth", omitted ? undefined : d.fatherPlaceOfBirth],
      ["Father's religion", omitted ? undefined : d.fatherReligion],
      ['Mother', motherOmitted ? `Not included (${d.motherOmittedReason ?? ''})` : personName(d, 'mother')],
      ["Mother's place of birth", motherOmitted ? undefined : d.motherPlaceOfBirth],
      ["Mother's religion", motherOmitted ? undefined : d.motherReligion],
      ['Residence', addressText(d, 'parentsResidence')],
    ])
  },
}

const marriageStep: WizardStep = {
  id: 'marriage',
  title: "Parents' marriage",
  shape: {
    parentsMarriage: z.enum(['catholic', 'civil', 'not_married'], { error: "Choose the parents' marriage status" }),
    parentsMarriageDate: z.string().nullish(),
    parentsMarriagePlace: z.string().max(255).nullish(),
  },
  refine: (d, ctx) => {
    if (d.parentsMarriage && d.parentsMarriage !== 'not_married') {
      refineWith(ctx, z.looseObject({
        parentsMarriageDate: pastDate('date of marriage'),
        parentsMarriagePlace: z.string({ error: 'Enter the place of marriage' }).trim().min(1, 'Enter the place of marriage'),
      }), d)
    }
  },
  clears: (d) => (d.parentsMarriage === 'not_married' ? ['parentsMarriageDate', 'parentsMarriagePlace'] : []),
  Component: function MarriageView({ step }) {
    const { form, onContinue } = useStepForm(step)
    const status = form.watch('parentsMarriage')
    const err = (k: string) => fieldError(form.formState.errors, k)
    return (
      <StepFrame onContinue={onContinue}>
        <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">Parents' marriage</h2>
        <ChoiceCards name="parentsMarriage" label="Marriage status" columns={1} register={form.register} value={status} options={MARRIAGE} error={err('parentsMarriage')} />
        {status && status !== 'not_married' && (
          <>
            <FormField id="parentsMarriageDate" type="date" label="Date of marriage" required max={parishToday()} {...form.register('parentsMarriageDate')} error={err('parentsMarriageDate')} />
            <FormField id="parentsMarriagePlace" label="Place of marriage" required {...form.register('parentsMarriagePlace')} error={err('parentsMarriagePlace')} />
          </>
        )}
      </StepFrame>
    )
  },
  review: (d) =>
    rows([
      ['Status', MARRIAGE.find((m) => m.value === d.parentsMarriage)?.label],
      ['Date', d.parentsMarriage !== 'not_married' ? d.parentsMarriageDate : undefined],
      ['Place', d.parentsMarriage !== 'not_married' ? d.parentsMarriagePlace : undefined],
    ]),
}

export const baptismWizard: WizardDefinition = {
  sacrament: 'baptism',
  steps: [
    scheduleStep(),
    bookingForStep('baptism'),
    childStep,
    parentsStep,
    marriageStep,
    sponsorsStep({
      min: 1,
      max: 8,
      minAge: 0,
      eligibility: 'principal',
      title: 'Godparents',
      noun: 'Godparent',
      hint: 'Add each Ninong and Ninang. The first one listed is the principal godparent: at least 16 and Roman Catholic. The fee is ₱50 per godparent.',
    }),
    documentsStep([
      { key: 'birthCertificate', label: 'PSA birth certificate', required: false },
      { key: 'marriageContract', label: "parents' marriage contract", required: false },
    ]),
  ],
  scheduleKeys: ['scheduleType'],
  prepare: [
    'Parents and godparents attend the pre-baptism seminar (the schedule comes with your approval).',
    'Bring a white baptismal garment and a baptismal candle.',
    'Arrive 30 minutes before the schedule.',
  ],
}
