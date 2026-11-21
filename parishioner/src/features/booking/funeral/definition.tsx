import { z } from 'zod'
import { FormField } from '../../../components/shared/FormField'
import { AddressFields } from '../../../components/fields/AddressFields'
import { REGION_III_CODE } from '../../../lib/api/psgc'
import { PersonFields } from '../../../components/fields/PersonFields'
import { fieldError } from '../../../components/fields/fieldError'
import { CIVIL_STATUS_LABEL, addDaysYmd, parishToday } from '../../../lib/domain'
import { addressKeys, addressShape, loose, pastDate, personShape, refineWith } from '../../../lib/validation/groups'
import { bookingForStep } from '../wizard/BookingForStep'
import { scheduleStep } from '../wizard/ScheduleStep'
import { documentsStep } from '../wizard/DocumentsStep'
import { StepFrame } from '../wizard/StepFrame'
import { useStepForm } from '../wizard/useStepForm'
import { addressText, personName, rows } from '../wizard/review'
import type { WizardDefinition, WizardStep } from '../wizard/types'

const CIVIL_STATUSES = Object.keys(CIVIL_STATUS_LABEL)
const YMD = /^\d{4}-\d{2}-\d{2}$/
/** A burial is within this many days of the death (mirrors SacramentRules::BURIAL_WINDOW_DAYS on the server). */
export const BURIAL_WINDOW_DAYS = 60

// The Mass place decides which times are free (a house Mass is off-site), so it is asked above the calendar.
const baseSchedule = scheduleStep({ massChoice: true })
const funeralScheduleStep: WizardStep = {
  ...baseSchedule,
  shape: { ...baseSchedule.shape, massType: z.enum(['church', 'house'], { error: 'Choose where the Mass will be' }) },
  // Saved with the slot: a church Mass has no wake address for the priest to travel to.
  clears: (d) => (d.massType === 'church' ? addressKeys('houseMassAddress') : []),
  review: (d) => rows([['Mass', d.massType === 'house' ? 'House Mass' : d.massType === 'church' ? 'Church Mass' : undefined]]),
}

const deceasedStep: WizardStep = {
  id: 'deceased',
  title: 'The deceased',
  shape: {
    ...personShape('deceased', { sex: true, age: true, religion: true, civilStatus: CIVIL_STATUSES }),
    // Burial is within 60 days of the death and never before today, so an older death date can have no valid burial.
    deceasedDateOfDeath: pastDate('date of death').refine(
      (v) => v >= addDaysYmd(parishToday(), -BURIAL_WINDOW_DAYS),
      `The date of death must be within the last ${BURIAL_WINDOW_DAYS} days. For an older death, ask the parish office.`,
    ),
    ...addressShape('deceasedResidence'),
  },
  Component: function DeceasedView({ step }) {
    const { form, onContinue } = useStepForm(step)
    return (
      <StepFrame onContinue={onContinue}>
        <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">About the deceased</h2>
        <PersonFields form={form} prefix="deceased" options={{ sex: true, age: true, religion: true, civilStatus: CIVIL_STATUSES }} />
        <FormField
          id="deceasedDateOfDeath"
          type="date"
          label="Date of death"
          min={addDaysYmd(parishToday(), -BURIAL_WINDOW_DAYS)}
          max={parishToday()}
          required
          {...form.register('deceasedDateOfDeath')}
          error={fieldError(form.formState.errors, 'deceasedDateOfDeath')}
        />
        <AddressFields form={form} name="deceasedResidence" label="Last residence" />
      </StepFrame>
    )
  },
  review: (d) =>
    rows([
      ['Name', personName(d, 'deceased')],
      ['Age', d.deceasedAge],
      ['Sex', d.deceasedSex === 'male' ? 'Male' : d.deceasedSex === 'female' ? 'Female' : undefined],
      ['Civil status', CIVIL_STATUS_LABEL[String(d.deceasedCivilStatus)]],
      ['Religion', d.deceasedReligion],
      ['Date of death', d.deceasedDateOfDeath],
      ['Last residence', addressText(d, 'deceasedResidence')],
    ]),
}

const massStep: WizardStep = {
  id: 'mass',
  title: 'Funeral Mass & burial',
  // massType is asked on the schedule step (it decides which times are free); its answer is in this form's defaults.
  shape: {
    ...loose(addressShape('houseMassAddress')),
    burialCemetery: z.string({ error: 'Enter the cemetery' }).trim().min(1, 'Enter the cemetery').max(255),
    burialDate: z.string({ error: 'Enter the burial date' }).regex(YMD, 'Enter the burial date'),
  },
  refine: (d, ctx) => {
    if (d.massType === 'house') refineWith(ctx, z.looseObject(addressShape('houseMassAddress')), d)
    if (typeof d.burialDate === 'string' && YMD.test(d.burialDate) && d.burialDate < parishToday()) {
      ctx.addIssue({ code: 'custom', path: ['burialDate'], message: "The burial date can't be in the past" })
    }
    if (typeof d.burialDate === 'string' && typeof d.deceasedDateOfDeath === 'string' && d.burialDate < d.deceasedDateOfDeath) {
      ctx.addIssue({ code: 'custom', path: ['burialDate'], message: "The burial date can't be before the date of death" })
    }
    if (typeof d.burialDate === 'string' && YMD.test(d.burialDate) && typeof d.deceasedDateOfDeath === 'string' && YMD.test(d.deceasedDateOfDeath) && d.burialDate > addDaysYmd(d.deceasedDateOfDeath, BURIAL_WINDOW_DAYS)) {
      ctx.addIssue({ code: 'custom', path: ['burialDate'], message: `The burial date must be within ${BURIAL_WINDOW_DAYS} days of the date of death` })
    }
  },
  clears: (d) => (d.massType === 'church' ? addressKeys('houseMassAddress') : []),
  Component: function MassView({ step }) {
    const { form, onContinue } = useStepForm(step)
    const massType = form.watch('massType')
    const err = (k: string) => fieldError(form.formState.errors, k)
    // Earlier steps' answers are in the form's defaults, so the picker can stay inside the allowed window.
    const death = String(form.getValues('deceasedDateOfDeath') ?? '')
    const burialLimits = YMD.test(death)
      ? { min: death > parishToday() ? death : parishToday(), max: addDaysYmd(death, BURIAL_WINDOW_DAYS) }
      : {}
    return (
      <StepFrame onContinue={onContinue}>
        <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">Funeral Mass & burial</h2>
        {massType === 'house' && <AddressFields form={form} name="houseMassAddress" label="Address of the wake" regionCodes={[REGION_III_CODE]} />}
        <FormField id="burialCemetery" label="Cemetery" required {...form.register('burialCemetery')} error={err('burialCemetery')} />
        <FormField id="burialDate" type="date" label="Burial date" required {...burialLimits} {...form.register('burialDate')} error={err('burialDate')} />
      </StepFrame>
    )
  },
  review: (d) =>
    rows([
      ['Wake address', d.massType === 'house' ? addressText(d, 'houseMassAddress') : undefined],
      ['Cemetery', d.burialCemetery],
      ['Burial date', d.burialDate],
    ]),
}

export const funeralWizard: WizardDefinition = {
  sacrament: 'funeral',
  steps: [
    funeralScheduleStep,
    bookingForStep('funeral'),
    deceasedStep,
    massStep,
    documentsStep([{ key: 'deathCertificate', label: 'death certificate', required: true }]),
  ],
  prepare: [
    'Bring the original death certificate to the parish office before the Mass.',
    'For a house Mass: a table with a clean cloth, a crucifix and two candles.',
    'The casket should arrive at least 30 minutes before a church Mass.',
  ],
  // A house Mass makes the booking off-site and adds travel time, so changing
  // the Mass type invalidates the chosen date and time.
  scheduleKeys: ['massType'],
}
