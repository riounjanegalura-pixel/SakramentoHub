import { useContext, useEffect, useMemo, useRef } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useBookingStore } from '../../../stores/booking-store'
import { useServerErrorsStore } from '../../../stores/server-errors-store'
import { useWizard, WizardContext } from './WizardContext'
import { stepSchema } from './schema'
import { flattenErrors, useStepErrorsStore } from './stepErrors'
import type { WizardStep } from './types'
import type { FormValues } from '../../../lib/validation/groups'

/**
 * Lets a step hand the wizard shell a "save what is on screen" function. The shell calls it before
 * the header Back and any jump to another step; on unmount it is also called (browser Back, or any
 * route change away), but only while the store still holds this wizard's draft, so Cancel, a reset
 * and a switch of sacrament never bring cleared answers back. The function must not validate.
 */
export function useRegisterDraft(commitDraft: () => void) {
  const wizard = useContext(WizardContext)
  const register = wizard?.registerDraft
  const sacrament = wizard?.definition.sacrament
  const latest = useRef(commitDraft)
  latest.current = commitDraft
  const discarded = wizard?.draftDiscarded
  const discardedRef = useRef(discarded)
  discardedRef.current = discarded
  useEffect(() => {
    if (!register) return
    register(() => latest.current())
    return () => {
      register(null)
      if (!discardedRef.current?.() && useBookingStore.getState().sacrament === sacrament) latest.current()
    }
  }, [register, sacrament])
}

export function useStepForm(step: WizardStep, options: { beforeSave?: (values: FormValues) => FormValues } = {}) {
  const formData = useBookingStore((s) => s.formData)
  const updateFormData = useBookingStore((s) => s.updateFormData)
  const setAppointment = useBookingStore((s) => s.setAppointment)
  const { definition, next } = useWizard()
  const schema = useMemo(() => stepSchema(step), [step])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: formData,
    mode: 'onTouched',
    // StepFrame moves focus to the first invalid field in page order (radio groups and pickers included).
    shouldFocusError: false,
  })

  // Publish the errors for the shared frame's error summary; only when they actually change.
  const flat = flattenErrors(form.formState.errors)
  const submitCount = form.formState.submitCount
  const reportKey = `${submitCount}|${JSON.stringify(flat)}`
  const latestReport = useRef({ errors: flat, submitCount })
  latestReport.current = { errors: flat, submitCount }
  useEffect(() => {
    useStepErrorsStore.getState().report(step.id, latestReport.current)
  }, [reportKey, step.id])
  useEffect(() => () => useStepErrorsStore.getState().clear(step.id), [step.id])

  // Show what the server refused as field errors too (the step banner lists them all).
  const serverErrors = useServerErrorsStore((s) => s.byStep[step.id])
  useEffect(() => {
    for (const e of serverErrors ?? []) {
      const root = e.path.split('.')[0]
      if (step.shape && root in step.shape) form.setError(e.path as never, { type: 'server', message: e.message })
    }
  }, [serverErrors, form, step])

  // The one place a step's answers reach the draft: Continue calls it with validated values, Back with
  // whatever is typed (no validation, so an invalid value survives and is still caught on Continue).
  const commit = (values: FormValues) => {
    const saved = { ...values, ...(options.beforeSave?.(values) ?? {}) }
    // Answers a toggle has hidden are set to undefined so the store merge overwrites (and later omits) them.
    for (const key of step.clears?.(saved) ?? []) saved[key] = undefined
    const previous = useBookingStore.getState().formData
    // A changed schedule-affecting answer can make the chosen slot invalid, so drop it.
    const scheduleChanged = (definition.scheduleKeys ?? []).some((k) => k in saved && saved[k] !== previous[k])
    updateFormData(saved)
    if (scheduleChanged) setAppointment(null, null)
  }
  useRegisterDraft(() => commit(form.getValues()))

  const onContinue = form.handleSubmit((values) => {
    useServerErrorsStore.getState().clearStep(step.id)
    commit(values)
    next()
  })

  return { form, onContinue }
}
