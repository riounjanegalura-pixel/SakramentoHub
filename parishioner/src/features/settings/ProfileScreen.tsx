import { toast } from 'sonner'
import { useEffect } from 'react'
import type { z } from 'zod'
import { useForm, type FieldValues, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { UserCircle } from 'lucide-react'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { profileSchema, type ProfileInput } from './schema'
import { updateCurrentUser, setCurrentUser } from '../../lib/data/users'
import { useAuthStore } from '../../stores/auth-store'
import { FormField } from '../../components/shared/FormField'
import { Button } from '../../components/ui/button'
import { FieldErrorAlertContext } from '../../components/ui/field'
import { FormAlert, PendingStatus, useServerErrors } from '../auth/authForm'
import { useSlowRequestNotice } from '../../hooks/useSlowRequestNotice'
import { SelectField } from '../../components/fields/SelectField'
import { AddressFields } from '../../components/fields/AddressFields'
import { CIVIL_STATUS_LABEL, parishToday } from '../../lib/domain'
import type { User } from '../../lib/types'

type ProfileFormValues = z.input<typeof profileSchema>

const SEX_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
]
const CIVIL_STATUS_OPTIONS = Object.entries(CIVIL_STATUS_LABEL).map(([value, label]) => ({ value, label }))

function toFormValues(user: User | null): Partial<ProfileFormValues> | undefined {
  if (!user) return undefined
  return {
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    birthDate: user.birthDate ?? '',
    sex: user.sex ?? undefined,
    civilStatus: (user.civilStatus as ProfileFormValues['civilStatus']) ?? undefined,
    // The old free-text address is carried into the street line until the parishioner picks a structured one.
    addressLine: user.addressLine || user.address || '',
    addressPsgc: user.addressPsgc?.display ?? '',
    addressPsgcRegionCode: user.addressPsgc?.regionCode ?? '',
    addressPsgcProvinceCode: user.addressPsgc?.provinceCode ?? '',
    addressPsgcCityCode: user.addressPsgc?.cityCode ?? '',
    addressPsgcBarangayCode: user.addressPsgc?.barangayCode ?? '',
  }
}

/** The API shape. civilStatus is omitted when unset (the server rejects a present null); the address clears with null. */
export function toProfilePayload(data: ProfileInput): Partial<User> {
  return {
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    birthDate: data.birthDate,
    sex: data.sex,
    ...(data.civilStatus ? { civilStatus: data.civilStatus } : {}),
    addressLine: data.addressLine ?? null,
    addressPsgc: data.addressPsgc
      ? {
          display: data.addressPsgc,
          regionCode: data.addressPsgcRegionCode ?? '',
          provinceCode: data.addressPsgcProvinceCode ?? '',
          cityCode: data.addressPsgcCityCode ?? '',
          barangayCode: data.addressPsgcBarangayCode ?? '',
        }
      : null,
  }
}

const FIELD_NAMES = [
  'fullName', 'email', 'phone', 'birthDate', 'sex', 'civilStatus',
  'addressPsgc', 'addressLine',
] as const

export function ProfileScreen() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)

  const form = useForm<ProfileFormValues, unknown, ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: toFormValues(user),
  })
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = form

  const mutation = useMutation({
    mutationFn: (data: ProfileInput) => {
      // The mock "current user" record lives in localStorage and is never
      // seeded elsewhere yet, so bootstrap it from the auth store here.
      if (user) setCurrentUser(user)
      return updateCurrentUser(toProfilePayload(data))
    },
    onSuccess: (updated) => {
      updateUser(updated)
      toast.success('Profile saved')
    },
  })
  const isSlow = useSlowRequestNotice(mutation.isPending)
  const server = useServerErrors(mutation.error, setError, FIELD_NAMES)

  // On a hard page load, the auth store rehydrates asynchronously (see
  // useAuthBootstrap) — user is still null on this component's first
  // render, so useForm's defaultValues capture nothing. Re-sync the form
  // once the real user arrives (and after a save: the saved values become the
  // new baseline, so the form is no longer "changed"); react-hook-form's
  // defaultValues are only read at mount.
  useEffect(() => {
    if (user) reset(toFormValues(user))
  }, [user, reset])

  if (!user) return null

  return (
    <AppShell header={<AppHeader title="Profile Info" onBack={() => navigate(-1)} />}>
      <form
        noValidate
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="mx-auto flex w-full max-w-xl flex-col px-4 py-6"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-2 flex size-24 items-center justify-center rounded-full bg-navy" aria-hidden="true">
            <UserCircle size={52} className="text-white" strokeWidth={1.25} />
          </div>
          <h2 className="text-lg font-semibold text-ink">{user.fullName}</h2>
          <p className="text-sm text-ink-muted">Parishioner</p>
        </div>

        {server.message && (
          <div className="mb-5">
            <FormAlert message={server.message} takeFocus={!server.mapped} />
          </div>
        )}

        <FieldErrorAlertContext.Provider value={!server.message}>
          <section aria-labelledby="profile-personal" className="mb-4">
            <h2 id="profile-personal" className="mb-3 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">Personal details</h2>
            <FormField id="fullName" label="Full name" required autoComplete="name" error={errors.fullName?.message} {...register('fullName')} />
            <FormField id="email" type="email" label="Email address" required autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} error={errors.email?.message} {...register('email')} />
            <FormField id="phone" type="tel" label="Contact number" required autoComplete="tel" inputMode="tel" error={errors.phone?.message} {...register('phone')} />
            <FormField id="birthDate" type="date" label="Date of birth" required autoComplete="bday" max={parishToday()} error={errors.birthDate?.message} {...register('birthDate')} />
            <SelectField id="sex" label="Sex" required autoComplete="sex" options={SEX_OPTIONS} error={errors.sex?.message} {...register('sex')} />
            <SelectField id="civilStatus" label="Civil status" options={CIVIL_STATUS_OPTIONS} error={errors.civilStatus?.message} {...register('civilStatus')} />
          </section>

          <section aria-labelledby="profile-address" className="mb-2">
            <h2 id="profile-address" className="mb-3 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">Home address</h2>
            <AddressFields form={form as unknown as UseFormReturn<FieldValues>} name="addressPsgc" label="City or municipality" withLine={false} required={false} />
            <FormField id="addressLine" label="House no. / street" placeholder="e.g. 123 Mabini St." autoComplete="address-line1" error={errors.addressLine?.message} {...register('addressLine')} />
          </section>
        </FieldErrorAlertContext.Provider>

        <PendingStatus pending={mutation.isPending} slow={isSlow}>
          Saving your profile…
        </PendingStatus>
        {mutation.isSuccess && !isDirty && !mutation.isPending && (
          <p role="status" className="mb-3 rounded-xl bg-status-done-bg px-4 py-3 text-sm font-semibold text-status-done-fg">
            Profile saved.
          </p>
        )}

        <div className="mt-2 flex flex-col gap-3 sm:flex-row-reverse">
          <Button type="submit" size="lg" disabled={mutation.isPending} loading={mutation.isPending} className="sm:flex-1">
            {mutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          {isDirty && !mutation.isPending && (
            <Button type="button" variant="outline" onClick={() => reset(toFormValues(user))} className="sm:flex-1">
              Discard changes
            </Button>
          )}
        </div>
      </form>
    </AppShell>
  )
}
