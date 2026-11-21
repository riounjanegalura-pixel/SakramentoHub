import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { forgotPasswordSchema, type ForgotPasswordInput } from './schema'
import { forgotPassword } from '../../lib/data/auth'
import { useSlowRequestNotice } from '../../hooks/useSlowRequestNotice'
import { Button } from '../../components/ui/button'
import { Field, FieldErrorAlertContext } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { AuthPage, FormAlert, PendingStatus, TEXT_LINK, useServerErrors } from './authForm'

export function ForgotPasswordScreen() {
  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) })

  const mutation = useMutation({
    mutationFn: (input: ForgotPasswordInput) => forgotPassword(input.email),
  })
  const isSlow = useSlowRequestNotice(mutation.isPending)
  const server = useServerErrors(mutation.error, setError, ['email'])

  return (
    <AuthPage title="Forgot Password?" subtitle="Enter your email and we'll send you a link to reset your password.">
      {mutation.isSuccess ? (
        <div className="grid gap-5">
          <div role="status" className="grid gap-3">
            <p className="text-sm text-ink">
              If an account exists for that email, a password reset link has been generated.
            </p>
            {/* Honest about the demo mechanism — there is no real SMTP here,
                so nothing lands in an actual inbox. */}
            <p className="text-sm text-ink-muted">
              Since this environment has no real email provider, the reset link is written
              to the server log instead of being emailed to you.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <form noValidate onSubmit={handleSubmit((data) => mutation.mutate(data))} className="grid gap-5">
          {server.message && <FormAlert message={server.message} takeFocus={!server.mapped} />}
          <FieldErrorAlertContext.Provider value={!server.message}>
            <Field id="email" label="Email address" required error={errors.email?.message}>
              <Input
                type="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.com"
                {...field('email')}
              />
            </Field>
          </FieldErrorAlertContext.Provider>

          <PendingStatus pending={mutation.isPending} slow={isSlow}>
            Sending the reset link…
          </PendingStatus>

          <Button type="submit" disabled={mutation.isPending} loading={mutation.isPending} className="w-full">
            {mutation.isPending ? 'Sending…' : 'Send Reset Link'}
          </Button>

          <p className="text-center">
            <Link to="/login" className={TEXT_LINK}>
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthPage>
  )
}
