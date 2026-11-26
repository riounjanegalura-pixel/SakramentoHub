// parishioner/src/features/booking/wedding/definition.tsx
import { useEffect } from 'react'
import { z } from 'zod'
import { SectionTabs } from '../../../components/shared/SectionTabs'
import { FormField } from '../../../components/shared/FormField'
import { AddressFields } from '../../../components/fields/AddressFields'
import { PersonFields } from '../../../components/fields/PersonFields'
import { SelectField } from '../../../components/fields/SelectField'
import { fieldError } from '../../../components/fields/fieldError'
import { CIVIL_STATUS_LABEL, MOTIFS, parishToday } from '../../../lib/domain'
import { addressShape, pastDate, personShape } from '../../../lib/validation/groups'
import type { FormValues } from '../../../lib/validation/groups'
import { bookingForStep } from '../wizard/BookingForStep'
import { scheduleStep } from '../wizard/ScheduleStep'
import { documentsStep, type DocSpec } from '../wizard/DocumentsStep'
import { sponsorsStep } from '../wizard/SponsorsStep'
import { StepFrame } from '../wizard/StepFrame'
import { useStepForm } from '../wizard/useStepForm'
import { addressText, personName, rows, splitName } from '../wizard/review'
import { addressFromProfile, civilStatusFromProfile } from '../wizard/profilePrefill'
import type { WizardDefinition, WizardStep } from '../wizard/types'

type Party = 'groom' | 'bride'
const LABEL: Record<Party, string> = { groom: 'Groom', bride: 'Bride' }
const PARTY_CIVIL = ['single', 'widowed', 'annulled'] as const
const PARTY_OPTIONS = { dob: true, minAgeYears: 18, placeOfBirth: true, religion: true, catholicOnly: true, citizenship: true, civilStatus: PARTY_CIVIL } as const
const text = (label: string) => z.string({ error: `Enter the ${label}` }).trim().min(1, `Enter the ${label}`).max(255)
// The parish marries in church only, in its own church: no convalidation, no other venue.
const CHURCH_WEDDING = 'Church wedding'
const PARISH_NAME = 'St. Peter the Apostle Parish'

function partyStep(x: Party): WizardStep {
  return {
    id: x,
    title: LABEL[x],
    shape: {
      ...personShape(x, PARTY_OPTIONS),
      ...addressShape(`${x}Residence`),
      ...personShape(`${x}Father`),
      [`${x}FatherCitizenship`]: text("father's citizenship").max(60, 'Citizenship must be 60 characters or fewer'),
      ...personShape(`${x}Mother`),
      [`${x}MotherCitizenship`]: text("mother's citizenship").max(60, 'Citizenship must be 60 characters or fewer'),
      [`${x}BaptismParish`]: text('parish of baptism'),
      [`${x}BaptismDate`]: pastDate('date of baptism'),
      [`${x}ConfirmationParish`]: text('parish of confirmation'),
    },
    Component: function PartyView({ step }) {
      const { form, onContinue } = useStepForm(step)
      const err = (k: string) => fieldError(form.formState.errors, k)
      const hasError = (...prefixes: string[]) => Object.keys(form.formState.errors).some((k) => prefixes.some((p) => k.startsWith(p)))
      return (
        <StepFrame onContinue={onContinue}>
          <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">{LABEL[x]}</h2>
          <SectionTabs
            label={`${LABEL[x]} details`}
            form={form}
            tabs={[
              {
                id: 'about',
                label: `About the ${x}`,
                owns: (k) => k.startsWith(x) && !/^(groom|bride)(Father|Mother|Baptism|Confirmation)/.test(k),
                hasError: Object.keys(form.formState.errors).some((k) => k.startsWith(x) && !/^(groom|bride)(Father|Mother|Baptism|Confirmation)/.test(k)),
                content: (
                  <>
                    <PersonFields form={form} prefix={x} options={{ ...PARTY_OPTIONS, fixedSex: x === 'groom' ? 'male' : 'female' }} />
                    <AddressFields form={form} name={`${x}Residence`} label="Residence" />
                  </>
                ),
              },
              {
                id: 'parents',
                label: 'Parents',
                owns: (k) => k.startsWith(`${x}Father`) || k.startsWith(`${x}Mother`),
                hasError: hasError(`${x}Father`, `${x}Mother`),
                content: (
                  <>
                    <PersonFields form={form} prefix={`${x}Father`} legend={`${LABEL[x]}'s father`} options={{ fixedSex: 'male' }} />
                    <FormField id={`${x}FatherCitizenship`} label="Father's citizenship" required placeholder="e.g. Filipino" {...form.register(`${x}FatherCitizenship`)} error={err(`${x}FatherCitizenship`)} />
                    <PersonFields form={form} prefix={`${x}Mother`} legend={`${LABEL[x]}'s mother`} options={{ fixedSex: 'female' }} lastNameLabel="Maiden last name" />
                    <FormField id={`${x}MotherCitizenship`} label="Mother's citizenship" required placeholder="e.g. Filipino" {...form.register(`${x}MotherCitizenship`)} error={err(`${x}MotherCitizenship`)} />
                  </>
                ),
              },
              {
                id: 'sacraments',
                label: 'Sacraments received',
                owns: (k) => k.startsWith(`${x}Baptism`) || k.startsWith(`${x}Confirmation`),
                hasError: hasError(`${x}Baptism`, `${x}Confirmation`),
                content: (
                  <>
                    <FormField id={`${x}BaptismParish`} label="Parish of baptism" description="The parish named on the baptismal certificate" placeholder="e.g. St. Peter the Apostle Parish, Balagtas" required {...form.register(`${x}BaptismParish`)} error={err(`${x}BaptismParish`)} />
                    <FormField id={`${x}BaptismDate`} type="date" label="Date of baptism" required max={parishToday()} {...form.register(`${x}BaptismDate`)} error={err(`${x}BaptismDate`)} />
                    <FormField id={`${x}ConfirmationParish`} label="Parish of confirmation" description="The parish named on the confirmation certificate" placeholder="e.g. St. Peter the Apostle Parish, Balagtas" required {...form.register(`${x}ConfirmationParish`)} error={err(`${x}ConfirmationParish`)} />
                  </>
                ),
              },
            ]}
          />
        </StepFrame>
      )
    },
    review: (d: FormValues) =>
      rows([
        ['Name', personName(d, x)],
        ['Date of birth', d[`${x}DateOfBirth`]],
        ['Place of birth', d[`${x}PlaceOfBirth`]],
        ['Citizenship', d[`${x}Citizenship`]],
        ['Religion', d[`${x}Religion`]],
        ['Civil status', CIVIL_STATUS_LABEL[String(d[`${x}CivilStatus`])]],
        ['Residence', addressText(d, `${x}Residence`)],
        ['Father', personName(d, `${x}Father`)],
        ["Father's citizenship", d[`${x}FatherCitizenship`]],
        ['Mother', personName(d, `${x}Mother`)],
        ["Mother's citizenship", d[`${x}MotherCitizenship`]],
        ['Parish of baptism', d[`${x}BaptismParish`]],
        ['Date of baptism', d[`${x}BaptismDate`]],
        ['Parish of confirmation', d[`${x}ConfirmationParish`]],
      ]),
  }
}

const detailsStep: WizardStep = {
  id: 'details',
  title: 'Wedding details',
  shape: {
    typeOfMarriage: z.literal(CHURCH_WEDDING),
    venueType: z.literal('parish'),
    candleSponsor: z.string().max(120).nullish(),
    veilSponsor: z.string().max(120).nullish(),
    cordSponsor: z.string().max(120).nullish(),
    motifNotes: z.enum(MOTIFS, { error: 'Choose the motif' }),
  },
  clears: (d) => (d.venueType === 'parish' ? ['venueName', 'venueAddress'] : []),
  Component: function DetailsView({ step }) {
    const { form, onContinue } = useStepForm(step)
    const { getValues, setValue } = form
    useEffect(() => {
      if (!getValues('typeOfMarriage')) setValue('typeOfMarriage', CHURCH_WEDDING)
      if (!getValues('venueType')) setValue('venueType', 'parish')
    }, [getValues, setValue])
    const err = (k: string) => fieldError(form.formState.errors, k)
    return (
      <StepFrame onContinue={onContinue}>
        <h2 className="mb-4 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">Wedding details</h2>
        <dl className="mb-4 text-body text-ink">
          <dt className="text-label text-ink-muted">Type of wedding</dt>
          <dd className="mb-2">{CHURCH_WEDDING}</dd>
          <dt className="text-label text-ink-muted">Venue</dt>
          <dd>{PARISH_NAME}</dd>
        </dl>
        <p className="mb-3 mt-2 text-sm font-semibold text-ink">Secondary sponsors (optional)</p>
        <FormField id="candleSponsor" label="Candle sponsor(s)" optional description="Names, separated by commas" {...form.register('candleSponsor')} />
        <FormField id="veilSponsor" label="Veil sponsor(s)" optional description="Names, separated by commas" {...form.register('veilSponsor')} />
        <FormField id="cordSponsor" label="Cord sponsor(s)" optional description="Names, separated by commas" {...form.register('cordSponsor')} />
        <SelectField id="motifNotes" label="Motif" required options={MOTIFS.map((m) => ({ value: m, label: m }))} {...form.register('motifNotes')} error={err('motifNotes')} />
      </StepFrame>
    )
  },
  review: (d) =>
    rows([
      ['Type', d.typeOfMarriage],
      ['Venue', PARISH_NAME],
      ['Candle sponsors', d.candleSponsor],
      ['Veil sponsors', d.veilSponsor],
      ['Cord sponsors', d.cordSponsor],
      ['Motif', d.motifNotes],
    ]),
}

function partyDocs(x: Party): DocSpec[] {
  const who = LABEL[x].toLowerCase()
  return [
    { key: `${x}BaptismalCertificate`, label: `${who}'s baptismal certificate (for marriage purposes)`, required: true },
    { key: `${x}ConfirmationCertificate`, label: `${who}'s confirmation certificate`, required: true },
    { key: `${x}Cenomar`, label: `${who}'s CENOMAR`, required: true },
    { key: `${x}SpouseDeathCertificate`, label: `${who}'s late spouse's death certificate`, required: (d) => d[`${x}CivilStatus`] === 'widowed' },
    { key: `${x}NullityDecree`, label: `${who}'s decree of nullity`, required: (d) => d[`${x}CivilStatus`] === 'annulled' },
    { key: `${x}Photo`, label: `${who}'s 2x2 photo`, required: true },
  ]
}

export const weddingWizard: WizardDefinition = {
  sacrament: 'wedding',
  steps: [
    scheduleStep(),
    bookingForStep('wedding'),
    partyStep('groom'),
    partyStep('bride'),
    sponsorsStep({
      min: 2,
      max: 12,
      minAge: 18,
      eligibility: 'none',
      title: 'Principal sponsors',
      noun: 'Principal sponsor',
      hint: 'Add sponsors in pairs: one Ninong and one Ninang each. All must be at least 18.',
      extraRefine: (d, ctx) => {
        const sponsors = (Array.isArray(d.sponsors) ? d.sponsors : []) as Array<{ role?: string }>
        const ninong = sponsors.filter((s) => s.role === 'ninong').length
        const ninang = sponsors.filter((s) => s.role === 'ninang').length
        if (sponsors.length % 2 !== 0 || ninong !== ninang) {
          ctx.addIssue({ code: 'custom', path: ['sponsors'], message: 'Principal sponsors must be in pairs (one Ninong and one Ninang each).' })
        }
      },
    }),
    detailsStep,
    documentsStep(
      [
        ...partyDocs('groom'),
        ...partyDocs('bride'),
        { key: 'marriageLicense', label: 'marriage license or Art. 34 affidavit', hint: 'Can follow later', required: false },
        { key: 'preCanaCertificate', label: 'Pre-Cana seminar certificate', hint: 'Can follow later', required: false },
        { key: 'bannsCertificate', label: 'banns certificate', hint: 'Can follow later', required: false },
        { key: 'confessionCertificate', label: 'confession certificate', hint: 'Can follow later', required: false },
      ],
      'Requirements',
    ),
  ],
  // Booking for oneself: the account fills the groom or the bride, by the sex on the profile (nothing is guessed when it is unset).
  prefillSelf: (user) => {
    const x = user.sex === 'male' ? 'groom' : user.sex === 'female' ? 'bride' : null
    if (!x) return {}
    const { first, last } = splitName(user.fullName)
    return { [`${x}FirstName`]: first, [`${x}LastName`]: last, [`${x}DateOfBirth`]: user.birthDate ?? undefined,
      [`${x}CivilStatus`]: civilStatusFromProfile(user, PARTY_CIVIL),
      ...addressFromProfile(user, `${x}Residence`),
    }
  },
  prepare: [
    'Book at least 2 days before the wedding date.',
    'Both of you attend the Pre-Cana seminar and the canonical interview (scheduled after approval).',
    'Bring originals of every uploaded document to the canonical interview.',
  ],
}
