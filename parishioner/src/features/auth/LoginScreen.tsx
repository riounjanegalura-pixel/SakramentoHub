import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { loginSchema, type LoginInput } from './schema'
import { login } from '../../lib/data/auth'
import { useAuthStore } from '../../stores/auth-store'
import { isStaffSide } from '../../lib/roles'
import { Button } from '../../components/ui/button'
import { Field, FieldErrorAlertContext } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { EmergencyCallRow } from '../../components/shared/EmergencyCallRow'
import { AuthPage, FOCUS, FormAlert, PasswordInput, TEXT_LINK, useServerErrors } from './authForm'

const REMEMBER_EMAIL_KEY = 'sakramentohub_remember_email'

export function LoginScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const accountDeleted = (location.state as { accountDeleted?: boolean } | null)?.accountDeleted ?? false
  const setUser = useAuthStore((s) => s.setUser)
  const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY) ?? ''
  const [rememberMe, setRememberMe] = useState(!!savedEmail)
  const [showPassword, setShowPassword] = useState(false)
  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: savedEmail, password: '' },
  })

  const mutation = useMutation({
    mutationFn: (input: LoginInput) => login(input.email, input.password),
    onSuccess: (user) => {
      setUser(user)
      // The parish office works from the desk; everyone else from their home screen.
      navigate(isStaffSide(user) ? '/desk' : '/home')
    },
  })
  // Login is the very first request of most sessions — the one most likely
  // to hit Render's free-tier cold start (30-60s to wake). Previously this
  // just showed "Signing In…" the whole time, indistinguishable from hung.
  const server = useServerErrors(mutation.error, setError, ['email', 'password'])

  return (
    <AuthPage title="Welcome back" subtitle="Sign in to your SakramentoHub account">
      <form
        noValidate
        onSubmit={handleSubmit((data) => {
          if (rememberMe) {
            localStorage.setItem(REMEMBER_EMAIL_KEY, data.email)
          } else {
            localStorage.removeItem(REMEMBER_EMAIL_KEY)
          }
          mutation.mutate(data)
        })}
        className="grid gap-5"
      >
        {accountDeleted && (
          <p className="rounded-xl border border-line bg-paper p-3 text-sm text-ink" role="status">
            Your account has been deleted.
          </p>
        )}
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

          <Field id="password" label="Password" required error={errors.password?.message}>
            <PasswordInput
              show={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
              autoComplete="current-password"
              placeholder="Enter your password"
              {...field('password')}
            />
          </Field>
        </FieldErrorAlertContext.Provider>

        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className={`size-5 rounded border-input-border ${FOCUS}`}
            />
            Remember me
          </label>
          <Link to="/forgot-password" className={TEXT_LINK}>
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" disabled={mutation.isPending} loading={mutation.isPending} className="w-full">
          {/* Button's `loading` already draws the one spinner; a second one here showed two. */}
          {mutation.isPending ? 'Signing in' : 'Sign in'}
        </Button>

        <p className="text-center text-sm text-ink-muted">
          New to SakramentoHub?{' '}
          <Link to="/register" className={TEXT_LINK}>
            Create an account
          </Link>
        </p>
      </form>
      <EmergencyCallRow className="mt-8" />
    </AuthPage>
  )
}
