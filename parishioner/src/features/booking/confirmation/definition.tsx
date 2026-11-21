import { z } from 'zod'
import { FormField } from '../../../components/shared/FormField'
import { SectionTabs } from '../../../components/shared/SectionTabs'
import { PersonFields } from '../../../components/fields/PersonFields'
import { fieldError } from '../../../components/fields/fieldError'
import { parishToday } from '../../../lib/domain'
import { pastDate, personShape } from '../../../lib/validation/groups'
import { bookingForStep } from '../wizard/BookingForStep'
import { scheduleStep } from '../wizard/ScheduleStep'
import { documentsStep } from '../wizard/DocumentsStep'
import { sponsorsStep } from '../wizard/SponsorsStep'
import { StepFrame } from '../wizard/StepFrame'
import { useStepForm } from '../wizard/useStepForm'
import { personName, rows, splitName } from '../wizard/review'
import type { WizardDefinition, WizardStep } from '../wizard/types'

const confirmandStep: WizardStep = {
  id: 'confirmand',
  title: 'Person to be confirmed',
  shape: personShape('confirmand', { dob: true, placeOfBirth: true, sex: true }),
  Component: function ConfirmandView({ step }) {
    const { form, onContinue } = useStepForm(step)
    return (
      <StepFrame onContinue={onContinue}>
        <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">Person to be confirmed</h2>
        <PersonFields form={form} prefix="confirmand" options={{ dob: true, placeOfBirth: true, sex: true }} />
      </StepFrame>
    )
  },
  review: (d) =>
    rows([
      ['Name', personName(d, 'confirmand')],
      ['Date of birth', d.confirmandDateOfBirth],
      ['Place of birth', d.confirmandPlaceOfBirth],
      ['Sex', d.confirmandSex === 'male' ? 'Male' : d.confirmandSex === 'female' ? 'Female' : undefined],
    ]),
}

const familyStep: WizardStep = {
  id: 'family',
  title: 'Parents',
  shape: { ...personShape('father'), ...personShape('mother') },
  Component: function FamilyView({ step }) {
    const { form, onContinue } = useStepForm(step)
    const errorKeys = Object.keys(form.formState.errors)
    return (
      <StepFrame onContinue={onContinue}>
        <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">Parents</h2>
        <SectionTabs
          label="Parents"
          tabs={[
            { id: 'father', label: 'Father', hasError: errorKeys.some((k) => k.startsWith('father')), content: <PersonFields form={form} prefix="father" legend="Father" options={{ fixedSex: 'male' }} /> },
            { id: 'mother', label: 'Mother', hasError: errorKeys.some((k) => k.startsWith('mother')), content: <PersonFields form={form} prefix="mother" legend="Mother" options={{ fixedSex: 'female' }} lastNameLabel="Maiden last name" /> },
          ]}
        />
      </StepFrame>
    )
  },
  review: (d) => rows([['Father', personName(d, 'father')], ['Mother', personName(d, 'mother')]]),
}

const baptismRecordStep: WizardStep = {
  id: 'baptism',
  title: 'Baptism record',
  shape: {
    baptismParish: z.string({ error: 'Enter the parish of baptism' }).trim().min(1, 'Enter the parish of baptism').max(255),
    baptismParishAddress: z.string({ error: 'Enter the parish address' }).trim().min(1, 'Enter the parish address').max(255),
    baptismDate: pastDate('date of baptism'),
  },
  Component: function BaptismRecordView({ step }) {
    const { form, onContinue } = useStepForm(step)
    const err = (k: string) => fieldError(form.formState.errors, k)
    return (
      <StepFrame onContinue={onContinue}>
        <h2 className="mb-2 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">Where were you baptized?</h2>
        <p className="mb-4 text-sm text-ink-muted">Copy these from the baptismal certificate.</p>
        <FormField id="baptismParish" label="Parish of baptism" description="The parish named on the baptismal certificate" placeholder="e.g. St. Peter the Apostle Parish, Balagtas" required {...form.register('baptismParish')} error={err('baptismParish')} />
        <FormField id="baptismParishAddress" label="Parish address" required placeholder="Town, province" {...form.register('baptismParishAddress')} error={err('baptismParishAddress')} />
        <FormField id="baptismDate" type="date" label="Date of baptism" required max={parishToday()} {...form.register('baptismDate')} error={err('baptismDate')} />
      </StepFrame>
    )
  },
  review: (d) => rows([['Parish', d.baptismParish], ['Address', d.baptismParishAddress], ['Date', d.baptismDate]]),
}

const normName = (first: unknown, last: unknown) => `${first ?? ''} ${last ?? ''}`.trim().toLowerCase().replace(/\s+/g, ' ')

export const confirmationWizard: WizardDefinition = {
  sacrament: 'confirmation',
  steps: [
    scheduleStep(),
    bookingForStep('confirmation'),
    confirmandStep,
    familyStep,
    baptismRecordStep,
    sponsorsStep({
      min: 1,
      max: 1,
      minAge: 16,
      eligibility: 'all',
      title: 'Sponsor',
      hint: 'One sponsor, at least 16, Roman Catholic, and not your parent.',
      extraRefine: (d, ctx) => {
        const s = Array.isArray(d.sponsors) ? (d.sponsors[0] as { firstName?: string; lastName?: string } | undefined) : undefined
        if (!s || !normName(s.firstName, s.lastName)) return
        for (const parent of ['father', 'mother']) {
          if (normName(s.firstName, s.lastName) === normName(d[`${parent}FirstName`], d[`${parent}LastName`])) {
            ctx.addIssue({ code: 'custom', path: ['sponsors', 0, 'lastName'], message: 'A parent cannot be the Confirmation sponsor' })
          }
        }
      },
    }),
    documentsStep([{ key: 'baptismalCertificate', label: 'baptismal certificate', required: true }]),
  ],
  prepare: [
    'Attend the parish Confirmation seminar (the schedule comes with your approval).',
    'Your sponsor must attend the rite with you.',
    'Arrive 30 minutes early, in modest clothing.',
  ],
  prefillSelf: (user) => {
    const { first, last } = splitName(user.fullName)
    return { confirmandFirstName: first, confirmandLastName: last, confirmandDateOfBirth: user.birthDate ?? undefined, confirmandSex: user.sex ?? undefined }
  },
}
