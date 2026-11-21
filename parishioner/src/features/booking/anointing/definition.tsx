import { z } from 'zod'
import { FormField } from '../../../components/shared/FormField'
import { AddressFields } from '../../../components/fields/AddressFields'
import { REGION_III_CODE } from '../../../lib/api/psgc'
import { ChoiceCards } from '../../../components/fields/ChoiceCards'
import { PersonFields } from '../../../components/fields/PersonFields'
import { fieldError } from '../../../components/fields/fieldError'
import { useAuthStore } from '../../../stores/auth-store'
import { addressKeys, addressShape, loose, personShape, refineWith } from '../../../lib/validation/groups'
import { bookingForStep } from '../wizard/BookingForStep'
import { scheduleStep } from '../wizard/ScheduleStep'
import { StepFrame } from '../wizard/StepFrame'
import { useStepForm } from '../wizard/useStepForm'
import { addressText, ageFrom, personName, rows, splitName, yesNo } from '../wizard/review'
import { addressFromProfile } from '../wizard/profilePrefill'
import type { WizardDefinition, WizardStep } from '../wizard/types'

const MOBILE = /^09\d{9}$/

/** An urgent request skips scheduling, so the priest needs a number to call; the server refuses the submit otherwise. */
const profileHasMobile = () => MOBILE.test(useAuthStore.getState().user?.phone ?? '')

const patientStep: WizardStep = {
  id: 'patient',
  title: 'The patient',
  shape: {
    ...personShape('patient', { sex: true, age: true }),
    locationType: z.enum(['home', 'hospital'], { error: 'Choose where the patient is' }),
    ...loose(addressShape('patientAddress')),
    hospitalName: z.string().max(255).nullish(),
    hospitalRoom: z.string().max(60).nullish(),
    inDangerOfDeath: z.boolean({ error: 'Please answer this question' }),
  },
  refine: (d, ctx) => {
    if (d.inDangerOfDeath === true && !profileHasMobile() && !MOBILE.test(String(d.alternatePhone ?? ''))) {
      ctx.addIssue({ code: 'custom', path: ['alternatePhone'], message: 'Add a mobile number we can call right now (09XXXXXXXXX). The priest needs it to reach you.' })
    }
    if (d.locationType === 'home') refineWith(ctx, z.looseObject(addressShape('patientAddress')), d)
    if (d.locationType === 'hospital') {
      const hospital = String(d.hospitalName ?? '').trim()
      const room = String(d.hospitalRoom ?? '').trim()
      // A real name has letters and some length; mirrors the server's rule so a typo is caught here, not at submit.
      if (!hospital) ctx.addIssue({ code: 'custom', path: ['hospitalName'], message: 'Enter the hospital' })
      else if (hospital.length < 3 || !/\p{L}{2}/u.test(hospital)) ctx.addIssue({ code: 'custom', path: ['hospitalName'], message: 'Enter the full name of the hospital' })
      if (!room) ctx.addIssue({ code: 'custom', path: ['hospitalRoom'], message: 'Enter the room or ward' })
      else if (!/[\p{L}\p{N}]/u.test(room)) ctx.addIssue({ code: 'custom', path: ['hospitalRoom'], message: 'Enter the room, ward or bed number' })
    }
  },
  clears: (d) => [
    ...(d.locationType === 'home' ? ['hospitalName', 'hospitalRoom'] : []),
    ...(d.locationType === 'hospital' ? addressKeys('patientAddress') : []),
  ],
  Component: function PatientView({ step }) {
    const { form, onContinue } = useStepForm(step)
    const location = form.watch('locationType')
    const danger = form.watch('inDangerOfDeath')
    const err = (k: string) => fieldError(form.formState.errors, k)
    return (
      <StepFrame onContinue={onContinue}>
        <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">About the patient</h2>
        <ChoiceCards
          name="inDangerOfDeath"
          label="Is the patient in danger of death right now?"
          boolean
          register={form.register}
          value={danger}
          error={err('inDangerOfDeath')}
          options={[
            { value: 'true', label: 'Yes, urgent', description: 'We will show the parish number to call now' },
            { value: 'false', label: 'No', description: 'Schedule a visit' },
          ]}
        />
        {danger === true && !profileHasMobile() && (
          <FormField
            id="alternatePhone"
            label="A mobile number we can call right now"
            required
            type="tel"
            inputMode="numeric"
            placeholder="09XXXXXXXXX"
            {...form.register('alternatePhone')}
            error={err('alternatePhone')}
          />
        )}
        <PersonFields form={form} prefix="patient" options={{ sex: true, age: true }} />
        <ChoiceCards
          name="locationType"
          label="Where is the patient?"
          register={form.register}
          value={location}
          error={err('locationType')}
          options={[
            { value: 'home', label: 'At home' },
            { value: 'hospital', label: 'In a hospital' },
          ]}
        />
        {location === 'home' && <AddressFields form={form} name="patientAddress" label="Home address" regionCodes={[REGION_III_CODE]} />}
        {location === 'hospital' && (
          <>
            <FormField id="hospitalName" label="Hospital" required {...form.register('hospitalName')} error={err('hospitalName')} />
            <FormField id="hospitalRoom" label="Room / ward / bed" required {...form.register('hospitalRoom')} error={err('hospitalRoom')} />
          </>
        )}
      </StepFrame>
    )
  },
  review: (d) =>
    rows([
      ['Patient', personName(d, 'patient')],
      ['Sex', d.patientSex === 'male' ? 'Male' : d.patientSex === 'female' ? 'Female' : undefined],
      ['Age', d.patientAge],
      ['Location', d.locationType === 'hospital' ? 'In a hospital' : d.locationType === 'home' ? 'At home' : undefined],
      ['Home address', d.locationType === 'home' ? addressText(d, 'patientAddress') : undefined],
      ['Hospital', d.locationType === 'hospital' ? d.hospitalName : undefined],
      ['Room / ward / bed', d.locationType === 'hospital' ? d.hospitalRoom : undefined],
      ['In danger of death', yesNo(d.inDangerOfDeath)],
    ]),
}

export const anointingWizard: WizardDefinition = {
  sacrament: 'anointing',
  steps: [bookingForStep('anointing'), patientStep, scheduleStep()],
  prepare: [
    'A small table with a clean cloth beside the patient',
    'A crucifix and two candles',
    'A glass of water and a spoon',
    'For the priest: a chair and an electric fan',
  ],
  prefillSelf: (user) => {
    const { first, last } = splitName(user.fullName)
    return { patientFirstName: first, patientLastName: last, patientSex: user.sex ?? undefined, patientAge: ageFrom(user.birthDate), ...addressFromProfile(user, 'patientAddress') }
  },
  // An urgent request skips scheduling entirely, so flipping the answer drops any chosen slot.
  scheduleKeys: ['inDangerOfDeath'],
}
