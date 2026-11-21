import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { Button } from '../../components/ui/button'
import { Field, FieldErrorAlertContext } from '../../components/ui/field'
import { changePasswordSchema, type ChangePasswordInput } from './schema'
import { changePassword } from '../../lib/data/auth'
import { FormAlert, PasswordInput, PendingStatus, useServerErrors } from '../auth/authForm'
import { useSlowRequestNotice } from '../../hooks/useSlowRequestNotice'

export function ChangePasswordScreen() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) })

  const mutation = useMutation({
    mutationFn: (data: ChangePasswordInput) => changePassword(data.currentPassword, data.newPassword),
    onSuccess: () => navigate('/settings', { state: { passwordUpdated: true } }),
  })
  const isSlow = useSlowRequestNotice(mutation.isPending)
  const server = useServerErrors(mutation.error, setError, ['currentPassword', 'newPassword', 'confirmPassword'])

  return (
    <AppShell showBottomNav={false} webFrame header={<AppHeader title="Change Password" onBack={() => navigate(-1)} />}>
      <section aria-labelledby="password-heading" className="mx-auto w-full max-w-md px-4 py-6">
        <h2 id="password-heading" className="mb-4 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">
          Password
        </h2>
        <form noValidate onSubmit={handleSubmit((data) => mutation.mutate(data))} className="grid gap-5">
          {server.message && <FormAlert message={server.message} takeFocus={!server.mapped} />}
          <FieldErrorAlertContext.Provider value={!server.message}>
            <Field id="currentPassword" label="Current password" required error={errors.currentPassword?.message}>
              <PasswordInput
                show={showPassword}
                autoComplete="current-password"
                placeholder="Enter your current password"
                {...register('currentPassword')}
              />
            </Field>
            <Field id="newPassword" label="New password" required error={errors.newPassword?.message}>
              <PasswordInput
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                autoComplete="new-password"
                placeholder="Enter your new password"
                {...register('newPassword')}
              />
            </Field>
            <Field id="confirmPassword" label="Confirm password" required error={errors.confirmPassword?.message}>
              <PasswordInput
                show={showPassword}
                autoComplete="new-password"
                placeholder="Confirm new password"
                {...register('confirmPassword')}
              />
            </Field>
          </FieldErrorAlertContext.Provider>

          <PendingStatus pending={mutation.isPending} slow={isSlow}>
            Changing your password…
          </PendingStatus>

          <Button type="submit" size="lg" disabled={mutation.isPending} loading={mutation.isPending} className="w-full">
            {mutation.isPending ? 'Changing…' : 'Change Password'}
          </Button>
        </form>
      </section>
    </AppShell>
  )
}
