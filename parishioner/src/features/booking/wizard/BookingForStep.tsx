import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { FormField } from '../../../components/shared/FormField'
import { ChoiceCards } from '../../../components/fields/ChoiceCards'
import { SelectField } from '../../../components/fields/SelectField'
import { fieldError } from '../../../components/fields/fieldError'
import { RELATIONSHIPS } from '../../../lib/domain'
import { useAuthStore } from '../../../stores/auth-store'
import { useBookingStore } from '../../../stores/booking-store'
import type { Sacrament } from '../../../lib/types'
import type { FormValues } from '../../../lib/validation/groups'
import { StepFrame } from './StepFrame'
import { useStepForm } from './useStepForm'
import { useWizard } from './WizardContext'
import { rows } from './review'
import type { WizardStep } from './types'

const RELATIONSHIP_VALUES = RELATIONSHIPS.map((r) => r.value) as string[]

export function bookingForStep(sacrament: Sacrament): WizardStep {
  return {
    id: 'for',
    title: 'Booking for',
    shape: {
      bookingFor:
        sacrament === 'funeral'
          ? z.literal('other', { error: 'A funeral is always booked for someone else' })
          : z.enum(['self', 'other'], { error: 'Choose who this booking is for' }),
      relationship: z.string().nullish(),
      // Said in their own words when the relationship is "Someone else".
      relationshipOther: z.string().max(80, 'Keep this under 80 characters').nullish(),
      alternatePhone: z
        .string()
        .refine((v) => v === '' || /^09\d{9}$/.test(v), 'Enter a valid PH mobile number (09XXXXXXXXX)')
        .nullish(),
    },
    refine: (d, ctx) => {
      if (d.bookingFor === 'other' && !RELATIONSHIP_VALUES.includes(String(d.relationship ?? ''))) {
        ctx.addIssue({ code: 'custom', path: ['relationship'], message: 'Choose your relationship' })
      }
      if (d.bookingFor === 'other' && d.relationship === 'other' && !String(d.relationshipOther ?? '').trim()) {
        ctx.addIssue({ code: 'custom', path: ['relationshipOther'], message: 'Tell us who they are to you' })
      }
    },
    clears: (d) => (d.bookingFor === 'self' ? ['relationship', 'relationshipOther'] : d.relationship === 'other' ? [] : ['relationshipOther']),
    Component: BookingForView,
    review: (d) =>
      rows([
        ['Booking for', d.bookingFor === 'self' ? 'Myself' : d.relationship === 'other' && d.relationshipOther ? `Someone else: ${d.relationshipOther}` : RELATIONSHIPS.find((r) => r.value === d.relationship)?.label ?? 'Someone else'],
        ['Alternate number', d.alternatePhone],
      ]),
  }
}

function fillMissing(prefill: FormValues, existing: FormValues): FormValues {
  return Object.fromEntries(Object.entries(prefill).filter(([k]) => existing[k] === undefined || existing[k] === ''))
}

function BookingForView({ step }: { step: WizardStep }) {
  const { definition } = useWizard()
  const user = useAuthStore((s) => s.user)
  const formData = useBookingStore((s) => s.formData)
  const onlyOther = definition.sacrament === 'funeral'

  const { form, onContinue } = useStepForm(step, {
    beforeSave: (v) => (v.bookingFor === 'self' && definition.prefillSelf && user ? fillMissing(definition.prefillSelf(user), formData) : {}),
  })

  useEffect(() => {
    if (!form.getValues('bookingFor')) form.setValue('bookingFor', onlyOther ? 'other' : 'self')
  }, [form, onlyOther])

  const bookingFor = form.watch('bookingFor')
  const relationship = form.watch('relationship')
  const err = (k: string) => fieldError(form.formState.errors, k)

  return (
    <StepFrame onContinue={onContinue}>
      <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">Who is this booking for?</h2>

      {!onlyOther && (
        <ChoiceCards
          name="bookingFor"
          label="This booking is for"
          register={form.register}
          value={bookingFor}
          options={[
            { value: 'self', label: 'Myself' },
            { value: 'other', label: 'Someone else', description: 'A child, parent, relative…' },
          ]}
          error={err('bookingFor')}
        />
      )}

      {bookingFor === 'self' && definition.prefillSelf && (
        <p className="mb-4 text-sm text-ink-muted">We'll fill in your details from your profile on the next steps. You can change anything.</p>
      )}

      {(onlyOther || bookingFor === 'other') && (
        <SelectField
          id="relationship"
          label={onlyOther ? 'Your relationship to the deceased' : 'Your relationship to them'}
          required
          options={RELATIONSHIPS}
          {...form.register('relationship')}
          error={err('relationship')}
        />
      )}

      {(onlyOther || bookingFor === 'other') && relationship === 'other' && (
        <FormField
          id="relationshipOther"
          label="Who are they to you?"
          placeholder="e.g. Godparent, neighbor, friend of the family"
          maxLength={80}
          {...form.register('relationshipOther')}
          error={err('relationshipOther')}
        />
      )}

      <div className="mb-4 rounded-xl bg-line/40 p-4 text-sm">
        <p className="mb-1 font-semibold text-ink">The parish will contact</p>
        <p className="text-ink">{user?.fullName}</p>
        <p className="text-ink-muted">
          {user?.email} · {user?.phone || 'No mobile number on file'}
        </p>
        <Link to="/settings/profile" className="mt-1 inline-flex min-h-11 items-center font-medium text-navy underline">
          Edit in profile
        </Link>
      </div>

      <FormField
        id="alternatePhone"
        label="Another number we can call"
        optional
        type="tel"
        inputMode="numeric"
        placeholder="09XXXXXXXXX"
        {...form.register('alternatePhone')}
        error={err('alternatePhone')}
      />
    </StepFrame>
  )
}
