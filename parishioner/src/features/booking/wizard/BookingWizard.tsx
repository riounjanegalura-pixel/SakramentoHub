import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as m from 'motion/react-m'
import { durations, ease } from '../../../lib/motion'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../../components/shared/AppShell'
import { StepperHeader } from '../../../components/shared/StepperHeader'
import { Emblem } from '../../../components/shared/Emblem'
import { WizardFooterBar, WizardFooterSlot } from '../../../components/shared/BookingFormStep'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { WebWizardLayout } from '../../../web/WebWizardLayout'
import { useBookingStore } from '../../../stores/booking-store'
import { useDeskStore } from '../../../stores/desk-store'
import { useServerErrorsStore } from '../../../stores/server-errors-store'
import { SACRAMENT_LABEL } from '../../../lib/domain'
import { walkInContactStep } from '../../desk/contactStep'
import { wizardFor } from './registry'
import { WizardContext } from './WizardContext'
import { ReviewAndSubmit } from './ReviewAndSubmit'
import type { WizardDefinition, WizardStep } from './types'

const REVIEW_STEP: WizardStep = { id: 'review', title: 'Review & Submit', Component: ReviewAndSubmit }

/** `mode="desk"` is the office walk-in flow: same steps, with "Who is this booking for?" replaced by the walk-in contact. */
export function BookingWizard({ mode = 'online' }: { mode?: 'online' | 'desk' }) {
  const { sacrament } = useParams()
  const definition = sacrament ? wizardFor(sacrament) : undefined
  if (!definition) return <Navigate to={mode === 'desk' ? '/desk' : '/services'} replace />
  return <WizardRunner key={`${mode}-${definition.sacrament}`} definition={definition} mode={mode} />
}

function WizardRunner({ definition, mode }: { definition: WizardDefinition; mode: 'online' | 'desk' }) {
  const navigate = useNavigate()
  const params = useParams()
  const desk = mode === 'desk'
  const base = desk ? '/desk' : '/booking'
  const formData = useBookingStore((s) => s.formData)
  // Titles that follow the answers. The steps are only rebuilt when a title really changes, so a keystroke never remounts a form.
  const titles = definition.steps.map((s) => s.titleFor?.(formData) ?? s.title).join('|')
  const wizardSteps = useMemo(
    () => {
      const resolved = titles.split('|')
      return (desk ? definition.steps.map((s) => (s.id === 'for' ? walkInContactStep(definition.sacrament) : s)) : definition.steps).map((s, i) =>
        s.titleFor && s.title !== resolved[i] ? { ...s, title: resolved[i] } : s,
      )
    },
    [desk, definition, titles],
  )
  const steps = [...wizardSteps, REVIEW_STEP]
  const total = steps.length
  const requested = Math.trunc(Number(params.step))
  const current = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), total) : 1

  // Forward slides in from the right, Back from the left. The first step shown does not animate: the screen's own scene change covers it.
  const lastStep = useRef<number | null>(null)
  const slideFrom = lastStep.current === null || lastStep.current === current ? 0 : current > lastStep.current ? 28 : -28
  useEffect(() => {
    lastStep.current = current
  }, [current])

  // The step on screen registers how to save what is typed; Back and jumps call it first.
  const draftRef = useRef<(() => void) | null>(null)
  const discardedRef = useRef(false)
  const draftDiscarded = useCallback(() => discardedRef.current, [])
  const registerDraft = useCallback((commit: (() => void) | null) => {
    draftRef.current = commit
  }, [])

  const isDesktop = useIsDesktop()
  // The phone footer element (drawn through AppShell's floating slot); each step portals its buttons into it.
  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null)
  const sacrament = useBookingStore((s) => s.sacrament)
  const startBooking = useBookingStore((s) => s.startBooking)
  const reset = useBookingStore((s) => s.reset)

  // Entering a different sacrament starts fresh; returning to the same one resumes.
  useEffect(() => {
    if (sacrament !== definition.sacrament) {
      startBooking(definition.sacrament)
      useServerErrorsStore.getState().clear()
      if (desk) useDeskStore.getState().reset()
    }
  }, [sacrament, definition.sacrament, startBooking, desk])

  // Until the store holds this sacrament's draft, render no step: a step's form
  // captures formData as its defaults on mount, and another sacrament's answers
  // must never carry over (the reset above runs after child effects).
  if (sacrament !== definition.sacrament) return null

  const goTo = (n: number) => {
    draftRef.current?.()
    navigate(`${base}/${definition.sacrament}/${n}`)
  }
  const leave = () => navigate(desk ? '/desk' : '/services')
  const discard = () => {
    // Discarding resets the store, which briefly re-mounts the step; it must not save over the reset.
    discardedRef.current = true
    draftRef.current = null
    reset()
    if (desk) useDeskStore.getState().reset()
    leave()
  }
  const step = steps[current - 1]
  const Step = step.Component
  const onBack = () => (current <= 1 ? leave() : goTo(current - 1))

  const body = (
    <WizardContext.Provider
      value={{
        definition,
        mode,
        steps: wizardSteps,
        stepId: step.id,
        stepIndex: current - 1,
        total,
        next: () => goTo(Math.min(current + 1, total)),
        goTo,
        registerDraft,
        draftDiscarded,
        cancel: discard,
        back: onBack,
      }}
    >
      <m.div
        key={step.id}
        initial={slideFrom ? { opacity: 0, x: slideFrom } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: durations.base, ease: [...ease] }}
      >
        <Step step={step} />
      </m.div>
    </WizardContext.Provider>
  )

  // The online wizard on a desktop: step list, current step, live summary. The desk flow keeps the phone frame (ruling 17).
  if (isDesktop && !desk) {
    return (
      <WebWizardLayout
        title={`${SACRAMENT_LABEL[definition.sacrament]} · ${step.title}`}
        steps={steps}
        current={current}
        onJump={goTo}
        onBack={onBack}
      >
        {body}
      </WebWizardLayout>
    )
  }

  return (
    <AppShell
      showBottomNav={false}
      header={
        <StepperHeader
          title={`${desk ? 'Walk-in · ' : ''}${SACRAMENT_LABEL[definition.sacrament]}`}
          steps={steps.map((s) => s.title)}
          currentStep={current}
          onBack={onBack}
          onDiscard={discard}
        />
      }
      floating={<WizardFooterBar ref={setFooterSlot} />}
    >
      <WizardFooterSlot.Provider value={footerSlot}>
        <div data-slot="step-entry" className="flex items-center gap-4 px-5 pt-5">
          <Emblem kind={definition.sacrament} size="sm" />
          {/* The documents step already carries its own heading with this title, so its entry title is not a second one. */}
          {step.id === 'documents' ? (
            <p className="min-w-0 font-display text-display-xl font-semibold text-navy [overflow-wrap:anywhere]">{step.title}</p>
          ) : (
            <h2 className="min-w-0 font-display text-display-xl font-semibold text-navy [overflow-wrap:anywhere]">{step.title}</h2>
          )}
        </div>
        {body}
      </WizardFooterSlot.Provider>
    </AppShell>
  )
}
