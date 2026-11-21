import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { resetPasswordSchema, type ResetPasswordInput } from './schema'
import { resetPassword } from '../../lib/data/auth'
import { useSlowRequestNotice } from '../../hooks/useSlowRequestNotice'
import { maskEmail } from '../../lib/mask-email'
import { Button } from '../../components/ui/button'
import { Field, FieldErrorAlertContext } from '../../components/ui/field'
import { AuthPage, FormAlert, PasswordInput, PendingStatus, useServerErrors } from './authForm'

export function ResetPasswordScreen() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const email = searchParams.get('email') ?? ''
  const [showPassword, setShowPassword] = useState(false)
  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) })

  const mutation = useMutation({
    mutationFn: (data: ResetPasswordInput) =>
      resetPassword(token, email, data.password, data.passwordConfirmation),
    onSuccess: () => navigate('/login', { state: { error: null, passwordReset: true } }),
  })
  const isSlow = useSlowRequestNotice(mutation.isPending)
  const server = useServerErrors(mutation.error, setError, ['password', 'passwordConfirmation'])

  const linkMissing = !token || !email

  return (
    <AuthPage title="Reset Password" subtitle="Choose a new password for your account.">
      {linkMissing ? (
        <div className="grid gap-5">
          <p role="alert" className="text-sm font-medium text-danger">
            This reset link is missing its token or email. Please request a new one.
          </p>
          <Button asChild className="w-full">
            <Link to="/forgot-password">Request a New Link</Link>
          </Button>
        </div>
      ) : (
        <form noValidate onSubmit={handleSubmit((data) => mutation.mutate(data))} className="grid gap-5">
          <p className="text-sm text-ink-muted">
            Resetting the password for <span className="font-semibold text-ink">{maskEmail(email)}</span>
          </p>
          {server.message && <FormAlert message={server.message} takeFocus={!server.mapped} />}

          <FieldErrorAlertContext.Provider value={!server.message}>
            <Field id="password" label="New password" required error={errors.password?.message}>
              <PasswordInput
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                autoComplete="new-password"
                placeholder="Enter your new password"
                {...field('password')}
              />
            </Field>

            <Field id="passwordConfirmation" label="Confirm password" required error={errors.passwordConfirmation?.message}>
              <PasswordInput
                show={showPassword}
                autoComplete="new-password"
                placeholder="Confirm your new password"
                {...field('passwordConfirmation')}
              />
            </Field>
          </FieldErrorAlertContext.Provider>

          <PendingStatus pending={mutation.isPending} slow={isSlow}>
            Resetting your password…
          </PendingStatus>

          <Button type="submit" disabled={mutation.isPending} loading={mutation.isPending} className="w-full">
            {mutation.isPending ? 'Resetting…' : 'Reset Password'}
          </Button>
        </form>
      )}
    </AuthPage>
  )
}
