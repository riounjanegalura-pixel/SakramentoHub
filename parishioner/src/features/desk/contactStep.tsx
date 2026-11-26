import { useEffect, useState } from 'react'
import { normalizePhone } from '../auth/schema'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { FormField } from '../../components/shared/FormField'
import { SelectField } from '../../components/fields/SelectField'
import { lookupParishioner } from '../../lib/data/walkIns'
import { useBookingStore } from '../../stores/booking-store'
import { useDeskStore } from '../../stores/desk-store'
import { useServerErrorsStore } from '../../stores/server-errors-store'
import { bookingForStep } from '../booking/wizard/BookingForStep'
import { StepFrame } from '../booking/wizard/StepFrame'
import { useWizard } from '../booking/wizard/WizardContext'
import { useRegisterDraft } from '../booking/wizard/useStepForm'
import type { WizardStep } from '../booking/wizard/types'
import type { Sacrament } from '../../lib/types'
import { deskRelationship } from './deskActions'

/** Values match the server's `relationship` list; "self" is stored as booking for oneself (never for a funeral). */
export const DESK_RELATIONSHIPS = [
  { value: 'self', label: 'The person at the counter' },
  { value: 'child', label: 'Their child' },
  { value: 'parent', label: 'Their parent' },
  { value: 'spouse', label: 'Their spouse' },
  { value: 'sibling', label: 'Their sibling' },
  { value: 'relative', label: 'A relative' },
  { value: 'other', label: 'Someone else' },
] as const

export function relationshipLabel(formData: Record<string, unknown>): string {
  const value = deskRelationship(formData)
  return DESK_RELATIONSHIPS.find((r) => r.value === value)?.label ?? ''
}

export const contactSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter their full name').max(120, 'Use 120 characters or fewer'),
  phone: z.string().transform(normalizePhone).pipe(z.string().regex(/^09\d{9}$/, 'Enter a valid PH mobile number (09XXXXXXXXX)')),
  email: z
    .string()
    .trim()
    .max(255, 'Use 255 characters or fewer')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email address'),
  relationship: z.string().min(1, 'Choose who is receiving the sacrament'),
})
type ContactForm = z.infer<typeof contactSchema>

/**
 * Step 1 of the desk wizard, in place of "Who is this booking for?". It owns the same answers
 * (`bookingFor`, `relationship`) so the server's rules and 422 mapping work unchanged; the contact
 * itself lives in the desk store because a walk-in has no account to hold it.
 */
export function walkInContactStep(sacrament: Sacrament): WizardStep {
  const base = bookingForStep(sacrament)
  return { id: 'contact', title: 'Walk-in contact', shape: base.shape, refine: base.refine, Component: ContactView }
}

function ContactView({ step }: { step: WizardStep }) {
  const { definition, next } = useWizard()
  const formData = useBookingStore((s) => s.formData)
  const updateFormData = useBookingStore((s) => s.updateFormData)
  const contact = useDeskStore((s) => s.contact)
  const linked = useDeskStore((s) => s.linkedAccount)
  const setContact = useDeskStore((s) => s.setContact)
  const setLinked = useDeskStore((s) => s.setLinkedAccount)
  const funeral = definition.sacrament === 'funeral'

  const form = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    mode: 'onTouched',
    defaultValues: {
      fullName: contact?.fullName ?? '',
      phone: contact?.phone ?? '',
      email: contact?.email ?? '',
      relationship: deskRelationship(formData) ?? '',
    },
  })
  const errors = form.formState.errors
  const typed = (form.watch('email') ?? '').trim().toLowerCase()
  // What the last lookup found, keyed by the address it was asked about.
  const [found, setFound] = useState<{ email: string; account: { id: string; fullName: string } | null } | null>(null)
  const [declined, setDeclined] = useState(false)

  const lookup = useMutation({
    mutationFn: (address: string) => lookupParishioner(address),
    onSuccess: (account, address) => {
      setDeclined(false)
      setFound({ email: address, account })
    },
  })

  // An edited email is no longer the account that was confirmed.
  useEffect(() => {
    if (linked && linked.email !== typed) setLinked(null)
  }, [typed, linked, setLinked])

  const current = found && found.email === typed ? found : null
  const candidate = current?.account && !declined ? current.account : null

  const save = (v: ContactForm) => {
    setContact({ fullName: v.fullName.trim(), phone: v.phone, email: v.email.trim() })
    updateFormData({ bookingFor: v.relationship === 'self' ? 'self' : 'other', relationship: v.relationship === 'self' ? null : v.relationship })
  }
  // Back keeps what is typed, valid or not: Review and the server check it again.
  useRegisterDraft(() => {
    const v = form.getValues()
    if (v.fullName || v.phone || v.email) setContact({ fullName: v.fullName.trim(), phone: v.phone, email: v.email.trim() })
    if (v.relationship) updateFormData({ bookingFor: v.relationship === 'self' ? 'self' : 'other', relationship: v.relationship === 'self' ? null : v.relationship })
  })

  const onContinue = form.handleSubmit((v) => {
    save(v)
    useServerErrorsStore.getState().clearStep(step.id)
    next()
  })

  const canLookUp = typed !== '' && z.email().safeParse(typed).success

  return (
    <StepFrame onContinue={onContinue}>
      <h2 className="mb-1 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">Who is at the counter?</h2>
      <p className="mb-4 text-sm text-ink-muted">The parish uses these details to contact them. They do not need an account.</p>

      <FormField id="fullName" label="Full name" required autoComplete="off" {...form.register('fullName')} error={errors.fullName?.message} />
      <FormField
        id="phone"
        label="Mobile number"
        required
        type="tel"
        inputMode="numeric"
        placeholder="09XXXXXXXXX"
        autoComplete="off"
        {...form.register('phone')}
        error={errors.phone?.message}
      />
      <FormField id="email" label="Email" optional type="email" autoComplete="off" {...form.register('email')} error={errors.email?.message} />

      {canLookUp && !linked && !candidate && (
        <div className="-mt-2 mb-4">
          <button
            type="button"
            disabled={lookup.isPending}
            onClick={() => lookup.mutate(typed)}
            className="rounded-full border border-navy px-4 py-2 text-sm font-semibold text-navy disabled:opacity-60"
          >
            {lookup.isPending ? 'Checking…' : 'Check for a parishioner account'}
          </button>
          {current && !current.account && <p className="mt-2 text-sm text-ink-muted">No parishioner account uses that email.</p>}
          {lookup.isError && <p role="alert" className="mt-2 text-sm text-danger">{(lookup.error as Error).message}</p>}
        </div>
      )}

      {candidate && !linked && (
        <div className="-mt-2 mb-4 rounded-xl border border-line bg-surface p-4 text-sm">
          <p className="text-ink">This email belongs to</p>
          <p className="mb-2 text-base font-semibold text-ink">{candidate.fullName}</p>
          <p className="mb-3 text-ink-muted">
            Link the booking to their account so they can see it in My Bookings? Only confirm if this is the person you are speaking with.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setLinked({ id: candidate.id, fullName: candidate.fullName, email: typed })}
              className="flex-1 rounded-xl min-h-11 bg-gold hover:bg-gold-press py-2 font-semibold text-navy"
            >
              Yes, link to {candidate.fullName}
            </button>
            <button type="button" onClick={() => setDeclined(true)} className="flex-1 rounded-xl min-h-11 border border-line py-2 font-semibold text-ink">
              No, keep it separate
            </button>
          </div>
        </div>
      )}

      {linked && (
        <p className="-mt-2 mb-4 flex items-center justify-between gap-3 rounded-xl bg-line/40 p-3 text-sm text-ink">
          <span>
            Linked to <strong>{linked.fullName}</strong>&apos;s account
          </span>
          <button
            type="button"
            onClick={() => {
              setLinked(null)
              setDeclined(true)
            }}
            className="shrink-0 font-semibold underline"
          >
            Unlink
          </button>
        </p>
      )}

      <SelectField
        id="relationship"
        label="Who is receiving it?"
        required
        options={funeral ? DESK_RELATIONSHIPS.filter((r) => r.value !== 'self') : DESK_RELATIONSHIPS}
        {...form.register('relationship')}
        error={errors.relationship?.message}
      />
    </StepFrame>
  )
}
