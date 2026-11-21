import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '../../components/ui/button'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { MyRequestsSection } from '../wallet/MyRequestsSection'
import { FormField } from '../../components/shared/FormField'
import { DocumentUploadField } from '../../components/shared/DocumentUploadField'
import { SelectField } from '../../components/fields/SelectField'
import { ApiError } from '../../lib/api/client'
import { useAuthStore } from '../../stores/auth-store'
import { createCertificateRequest } from '../../lib/data/certificateRequests'
import { fetchMyRegisterEntries } from '../../lib/data/registerEntries'
import type { CertificateRequestInput } from '../../lib/types'
import { CERTIFICATE_LABEL, CERTIFICATE_SACRAMENTS, REGISTER_LABEL, RELATIONSHIP_OPTIONS } from './certificateKinds'

const optionalName = z.string().trim().max(160, 'Use 160 characters or fewer')

/** Mirrors the server rules (docs/api-contract.md, "Certificate copy requests"). */
const schema = z
  .object({
    sacrament: z.enum(['baptism', 'confirmation', 'wedding', 'funeral'], { message: 'Choose which record you need' }),
    lookup: z.enum(['number', 'details']),
    registerNumber: z.string().trim().max(40, 'Use 40 characters or fewer'),
    personName: z.string().trim().max(160, 'Use 160 characters or fewer'),
    sacramentDateText: z.string().trim().max(60, 'Use 60 characters or fewer'),
    fatherName: optionalName,
    motherName: optionalName,
    spouseName: optionalName,
    relationship: z.enum(['self', 'parent', 'child', 'spouse', 'sibling', 'representative'], { message: 'Choose your relationship to this person' }),
    purpose: z.string().trim().min(1, 'Tell the office what the copy is for').max(200, 'Use 200 characters or fewer'),
    idUrl: z.string().min(1, 'Add a photo of your valid ID'),
    letterUrl: z.string(),
  })
  .superRefine((v, ctx) => {
    // The register number names the record on its own; without it the record is found by name and date.
    if (v.lookup === 'number') {
      if (!v.registerNumber) ctx.addIssue({ code: 'custom', path: ['registerNumber'], message: 'Enter the register number printed on your certificate' })
    } else {
      if (!v.personName) ctx.addIssue({ code: 'custom', path: ['personName'], message: 'Enter the name on the record' })
      if (!v.sacramentDateText) ctx.addIssue({ code: 'custom', path: ['sacramentDateText'], message: 'Enter the date or year' })
    }
    if (v.relationship === 'representative' && !v.letterUrl) {
      ctx.addIssue({ code: 'custom', path: ['letterUrl'], message: 'Add the authorisation letter' })
    }
  })
type FormValues = z.infer<typeof schema>

/** Only the answers that belong to the chosen record and relationship are sent. */
function toPayload(v: FormValues): CertificateRequestInput {
  const details: NonNullable<CertificateRequestInput['details']> = {}
  const parents = v.sacrament === 'baptism' || v.sacrament === 'confirmation'
  if (parents && v.fatherName.trim()) details.fatherName = v.fatherName.trim()
  if (parents && v.motherName.trim()) details.motherName = v.motherName.trim()
  if (v.sacrament === 'wedding' && v.spouseName.trim()) details.spouseName = v.spouseName.trim()
  const byNumber = v.lookup === 'number'
  return {
    sacrament: v.sacrament,
    ...(byNumber ? { registerNumber: v.registerNumber.trim() } : { personName: v.personName.trim(), sacramentDateText: v.sacramentDateText.trim() }),
    ...(!byNumber && Object.keys(details).length ? { details } : {}),
    relationship: v.relationship,
    purpose: v.purpose.trim(),
    idUrl: v.idUrl,
    ...(v.relationship === 'representative' ? { letterUrl: v.letterUrl } : {}),
  }
}

const FIELD_OF_SERVER_KEY: Record<string, keyof FormValues> = {
  'details.fatherName': 'fatherName',
  'details.motherName': 'motherName',
  'details.spouseName': 'spouseName',
}

export function RequestCertificateScreen() {
  const isDesktop = useIsDesktop()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [refusal, setRefusal] = useState<string | null>(null)
  const userName = useAuthStore((s) => s.user?.fullName ?? '')
  const entries = useQuery({ queryKey: ['register-entries'], queryFn: fetchMyRegisterEntries })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      sacrament: undefined, lookup: 'number', registerNumber: '', personName: '', sacramentDateText: '', fatherName: '', motherName: '', spouseName: '',
      relationship: undefined, purpose: '', idUrl: '', letterUrl: '',
    },
  })
  const { register, handleSubmit, watch, setValue, setError, formState: { errors } } = form
  const sacrament = watch('sacrament')
  const relationship = watch('relationship')
  const hasNumber = watch('lookup') === 'number'
  const idUrl = watch('idUrl')
  const letterUrl = watch('letterUrl')
  // Asking for one's own record: the name on it is most often the account's own, so start from it (never over what was typed).
  useEffect(() => {
    if (relationship === 'self' && userName && !form.getValues('personName')) setValue('personName', userName)
  }, [relationship, userName, form, setValue])

  const submit = useMutation({
    mutationFn: (values: FormValues) => createCertificateRequest(toPayload(values)),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['certificate-requests'] })
      navigate('/wallet', { state: { submittedReference: created.referenceNumber } })
    },
    onError: (error) => {
      setRefusal(null)
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        for (const [key, messages] of Object.entries(error.fieldErrors)) {
          const field = FIELD_OF_SERVER_KEY[key] ?? (key as keyof FormValues)
          setError(field, { type: 'server', message: messages[0] })
        }
        return
      }
      setRefusal(error instanceof Error && error.message ? error.message : 'Could not send your request. Try again.')
    },
  })

  const parents = sacrament === 'baptism' || sacrament === 'confirmation'
  const alreadyHeld = sacrament
    ? entries.data?.some((e) => e.register === REGISTER_LABEL[sacrament] && e.status === 'valid')
    : false

  return (
    <AppShell header={<AppHeader title="Request a certificate copy" onBack={() => navigate(-1)} />} webWidth="max-w-6xl">
      <div className={isDesktop ? 'grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]' : undefined}>
      <form
        noValidate
        onSubmit={handleSubmit((values) => {
          setRefusal(null)
          submit.mutate(values)
        })}
        className="px-4 py-4"
      >
        {refusal && (
          <p role="alert" className="mb-4 rounded-xl bg-status-rejected-bg p-3 text-sm text-danger">{refusal}</p>
        )}

        <SelectField
          id="cert-sacrament"
          label="Which record do you need?"
          required
          options={CERTIFICATE_SACRAMENTS.map((s) => ({ value: s, label: CERTIFICATE_LABEL[s] }))}
          error={errors.sacrament?.message}
          {...register('sacrament')}
        />

        {alreadyHeld && sacrament && (
          <p className="-mt-2 mb-4 rounded-xl bg-line/40 p-3 text-sm text-ink">
            You already have a {REGISTER_LABEL[sacrament]} certificate in your wallet.{' '}
            <Link to="/wallet" className="font-semibold underline">Open my wallet</Link>
          </p>
        )}

        <div role="radiogroup" aria-label="How to find the record" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-paper-deep p-1">
          {([['number', 'I have the register number'], ['details', "I don't have it"]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={!hasNumber === (value === 'details')}
              onClick={() => setValue('lookup', value, { shouldValidate: false })}
              className={`min-h-11 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${!hasNumber === (value === 'details') ? 'bg-surface font-semibold text-navy ring-2 ring-inset ring-navy' : 'font-medium text-ink-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {hasNumber && (
          <FormField
            id="cert-number"
            label="Register number on your certificate"
            required
            description="e.g. BAP-2019-0042. It is printed on the certificate. The office finds the record from it, so nothing else about the record is needed."
            maxLength={40}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            error={errors.registerNumber?.message}
            {...register('registerNumber')}
          />
        )}

        {!hasNumber && (
          <>
            <FormField id="cert-person" label="Name on the record" required maxLength={160} error={errors.personName?.message} {...register('personName')} />

            <FormField id="cert-date" label="Date or year of the sacrament" required description="e.g. March 1998 or 1998" maxLength={60} error={errors.sacramentDateText?.message} {...register('sacramentDateText')} />
          </>
        )}

        {parents && !hasNumber && (
          <>
            <FormField id="cert-father" label="Father's name" optional description="If you know it" maxLength={160} error={errors.fatherName?.message} {...register('fatherName')} />
            <FormField id="cert-mother" label="Mother's name" optional description="If you know it" maxLength={160} error={errors.motherName?.message} {...register('motherName')} />
          </>
        )}
        {sacrament === 'wedding' && !hasNumber && (
          <FormField id="cert-spouse" label="Spouse's name" optional description="If you know it" maxLength={160} error={errors.spouseName?.message} {...register('spouseName')} />
        )}

        <SelectField
          id="cert-relationship"
          label="Your relationship to this person"
          required
          options={RELATIONSHIP_OPTIONS}
          error={errors.relationship?.message}
          {...register('relationship')}
        />

        <FormField id="cert-purpose" label="What is the copy for?" required maxLength={200} error={errors.purpose?.message} {...register('purpose')} />

        <DocumentUploadField
          id="cert-id"
          label="Photo of your valid ID"
          required
          value={idUrl}
          error={errors.idUrl?.message}
          onUploaded={(url) => setValue('idUrl', url, { shouldValidate: true })}
        />
        <p className="-mt-2 mb-4 text-label text-ink-muted">
          The parish office compares it with the record. It is deleted 30 days after the request is closed. JPG, PNG or PDF, up to 5 MB.
        </p>

        {relationship === 'representative' && (
          <DocumentUploadField
            id="cert-letter"
            label="Authorisation letter"
            required
            value={letterUrl}
            error={errors.letterUrl?.message}
            onUploaded={(url) => setValue('letterUrl', url, { shouldValidate: true })}
          />
        )}

        <p className="mb-4 text-sm text-ink-muted">There is no fee through the app. Any stipend is settled at the parish office.</p>

        <Button type="submit" size="lg" disabled={submit.isPending} loading={submit.isPending} className="w-full">
          {submit.isPending ? 'Sending…' : 'Send request'}
        </Button>
      </form>
      {isDesktop && (
        <aside aria-label="Your requests" className="sticky top-6 self-start">
          <MyRequestsSection />
        </aside>
      )}
      </div>
    </AppShell>
  )
}
