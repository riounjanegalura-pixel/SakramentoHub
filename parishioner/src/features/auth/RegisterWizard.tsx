import { useEffect, useId, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { REGISTER_MIN_AGE, registerSchema, type RegisterInput } from './schema'
import { register as registerUser } from '../../lib/data/auth'
import { BirthDateSelects } from '../../components/fields/BirthDateSelects'
import { useAuthStore } from '../../stores/auth-store'
import { ApiError } from '../../lib/api/client'
import { useSlowRequestNotice } from '../../hooks/useSlowRequestNotice'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { PrivacyNoticeBody } from '../settings/PrivacyNoticeScreen'
import { Button } from '../../components/ui/button'
import { Field, FieldErrorAlertContext } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { AuthPage, FOCUS, FormAlert, NATIVE_SELECT, PasswordInput, PendingStatus, TEXT_LINK, useServerErrors } from './authForm'

const STEPS = ['Personal Info', 'Contact Info', 'Security'] as const

const FIELDS_BY_STEP: (keyof RegisterInput)[][] = [
  ['fullName', 'birthDate', 'sex'],
  ['email', 'phone'],
  ['password', 'privacyConsent'],
]
const ALL_FIELDS = FIELDS_BY_STEP.flat() as string[]

export function RegisterWizard() {
  const [step, setStep] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const formRef = useRef<HTMLFormElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const consentErrorId = useId()
  const {
    register: field,
    handleSubmit,
    trigger,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema), mode: 'onBlur' })

  const mutation = useMutation({
    mutationFn: registerUser,
    onSuccess: (user) => {
      setUser(user)
      navigate('/home')
    },
  })
  const isSlow = useSlowRequestNotice(mutation.isPending)
  const server = useServerErrors(mutation.error, setError, ALL_FIELDS)

  // A refusal about a field on another step takes the person back to that step, so the error is where they can fix it.
  useEffect(() => {
    const error = mutation.error
    if (!(error instanceof ApiError)) return
    const target = FIELDS_BY_STEP.findIndex((names) => names.some((n) => error.fieldErrors[n]?.length))
    if (target >= 0) setStep(target)
  }, [mutation.error])

  // After the step changes, focus goes to an invalid field if one is shown, else to the step heading.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
    ;(invalid ?? headingRef.current)?.focus()
  }, [step])

  async function handleNext() {
    const valid = await trigger(FIELDS_BY_STEP[step], { shouldFocus: true })
    if (!valid) return
    if (step === STEPS.length - 1) {
      handleSubmit((data) => mutation.mutate(data))()
    } else {
      setStep((s) => s + 1)
    }
  }

  const last = step === STEPS.length - 1

  return (
    <AuthPage title="Create Account" subtitle="Join SakramentoHub parish">
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void handleNext()
        }}
        className="grid gap-5"
      >
        {step > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)} className="-ml-3 justify-self-start">
            <ChevronLeft aria-hidden="true" />
            Back
          </Button>
        )}

        <div>
          <div aria-hidden="true" className="mb-3 flex gap-2">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-navy' : 'bg-line'}`} />
            ))}
          </div>
          <h2 ref={headingRef} tabIndex={-1} className="font-display text-lg font-semibold text-ink outline-none">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </h2>
        </div>

        {server.message && <FormAlert message={server.message} takeFocus={!server.mapped} />}

        <FieldErrorAlertContext.Provider value={!server.message}>
          {step === 0 && (
            <>
              <Field id="fullName" label="Full name" required error={errors.fullName?.message}>
                <Input autoComplete="name" placeholder="Enter your full name" {...field('fullName')} />
              </Field>
              <Field id="birthDate" label="Date of birth" required description={`You must be at least ${REGISTER_MIN_AGE} years old to create an account. A parent books for a younger child from their own account.`} error={errors.birthDate?.message}>
                <Controller
                  control={control}
                  name="birthDate"
                  defaultValue=""
                  render={({ field: f }) => (
                    <BirthDateSelects id="birthDate" value={f.value ?? ''} onChange={f.onChange} minAgeYears={REGISTER_MIN_AGE} invalid={!!errors.birthDate} />
                  )}
                />
              </Field>
              <Field id="sex" label="Sex" required error={errors.sex?.message}>
                <select autoComplete="sex" defaultValue="" className={NATIVE_SELECT} {...field('sex')}>
                  <option value="" disabled>
                    Select…
                  </option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </Field>
            </>
          )}
          {step === 1 && (
            <>
              <Field id="phone" label="Contact number" required error={errors.phone?.message}>
                <Input type="tel" autoComplete="tel" inputMode="tel" placeholder="09XX XXX XXXX" {...field('phone')} />
              </Field>
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
            </>
          )}
          {step === 2 && (
            <>
              <Field id="password" label="Password" required description="At least 8 characters." error={errors.password?.message}>
                <PasswordInput
                  show={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  autoComplete="new-password"
                  placeholder="Create a Password"
                  {...field('password')}
                />
              </Field>

              <div className="grid gap-1.5">
                <div className="flex items-start gap-3">
                  <input
                    id="privacyConsent"
                    type="checkbox"
                    aria-required="true"
                    aria-invalid={errors.privacyConsent ? true : undefined}
                    aria-describedby={errors.privacyConsent ? consentErrorId : undefined}
                    className={`mt-px size-5 shrink-0 rounded border-input-border ${FOCUS}`}
                    {...field('privacyConsent')}
                  />
                  <label htmlFor="privacyConsent" className="text-sm leading-5 text-ink">
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={() => setShowPrivacy(true)}
                      className={`inline font-semibold text-navy underline underline-offset-4 ${FOCUS}`}
                    >
                      Privacy Notice
                    </button>{' '}
                    and consent to the processing of my personal data for parish sacrament records.
                  </label>
                </div>
                {errors.privacyConsent && (
                  <p
                    id={consentErrorId}
                    role={server.message ? undefined : 'alert'}
                    className="text-sm font-medium text-danger"
                  >
                    {errors.privacyConsent.message}
                  </p>
                )}
              </div>
            </>
          )}
        </FieldErrorAlertContext.Provider>

        {/* Read in a panel, not on another page: leaving the form would throw away what has been typed. */}
        <ConfirmDialog
          open={showPrivacy}
          onOpenChange={setShowPrivacy}
          title="Privacy Notice"
          description="How the parish collects and uses your data."
        >
          <div className="grid max-h-[55vh] gap-6 overflow-y-auto text-base leading-relaxed text-ink">
            <PrivacyNoticeBody />
          </div>
          <Button
            type="button"
            size="lg"
            onClick={() => {
              setValue('privacyConsent', true, { shouldValidate: true })
              setShowPrivacy(false)
            }}
          >
            I agree
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowPrivacy(false)}>
            Close
          </Button>
        </ConfirmDialog>

        <PendingStatus pending={mutation.isPending} slow={isSlow}>
          Creating your account…
        </PendingStatus>

        <Button type="submit" disabled={mutation.isPending} loading={mutation.isPending} className="w-full">
          {mutation.isPending ? 'Creating Account…' : last ? 'Create Account' : 'Continue'}
        </Button>

        <p className="text-center text-sm text-ink-muted">
          Already have an account?{' '}
          <Link to="/login" className={TEXT_LINK}>
            Sign in
          </Link>
        </p>
      </form>
    </AuthPage>
  )
}
