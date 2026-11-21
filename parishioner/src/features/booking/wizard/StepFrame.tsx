import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { BookingFormStep } from '../../../components/shared/BookingFormStep'
import { FieldErrorAlertContext } from '../../../components/ui/field'
import { useServerErrorsStore } from '../../../stores/server-errors-store'
import { useStepErrorsStore, type StepFieldError } from './stepErrors'
import { useWizard } from './WizardContext'

const FOCUSABLE = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]'

/** The element to focus for an invalid control: itself, or inside a group (a radio group focuses its checked radio). */
function focusableIn(el: Element | null): HTMLElement | null {
  if (!el) return null
  if (el.matches(FOCUSABLE)) return el as HTMLElement
  return (el.querySelector('input[type="radio"]:checked') ?? el.querySelector(FOCUSABLE)) as HTMLElement | null
}

/** The control for a field path: by id (FormField, SelectField, pickers), else by name (radio groups). */
function targetFor(root: HTMLElement | null, path: string): HTMLElement | null {
  if (!root) return null
  const byId = document.getElementById(path)
  if (byId && root.contains(byId)) return focusableIn(byId)
  return focusableIn(root.querySelector(`[name="${path.replace(/["\\]/g, '\\$&')}"]`))
}

/** From this many problems the summary is worth its space; fewer are already visible on their own fields. */
const SUMMARY_MIN_ERRORS = 3

function sameError(a: StepFieldError, b: StepFieldError) {
  return a.path === b.path && a.message === b.message
}

/**
 * The shared frame of every wizard step: the error summary, the body and the footer.
 *
 * After Continue finds problems focus moves to the first invalid field in page order (spec section 10) and the
 * answers stay. One or two problems are shown on their own fields only (each announced there). A summary at the top
 * with a link to each field appears for three or more problems, when the server refused the step, or when a problem
 * has no field on screen; its list is folded away for the client's own checks, so it costs one line.
 */
export function StepFrame(props: { children: ReactNode; onContinue: () => void; continueLabel?: string; continueDisabled?: boolean }) {
  const { cancel, back, stepIndex, stepId } = useWizard()
  const serverErrors = useServerErrorsStore((s) => (stepId ? s.byStep[stepId] : undefined))
  const report = useStepErrorsStore((s) => (stepId ? s.byStep[stepId] : undefined))
  // Each Continue is a new attempt; opening the step with the server's refusal counts as attempt 1.
  const [attempt, setAttempt] = useState(() => (serverErrors?.length ? 1 : 0))
  const attempted = attempt > 0
  const bodyRef = useRef<HTMLDivElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  // Focus moves once per attempt, never while typing: the last attempt whose focus was handled.
  const focusedAttempt = useRef(0)

  const hasServer = !!serverErrors?.length
  const clientErrors = report?.errors ?? []
  const merged = [...clientErrors, ...(serverErrors ?? []).filter((e) => !clientErrors.some((c) => sameError(c, e)))]
  const visible = attempted || hasServer || (report?.submitCount ?? 0) > 0
  const items = visible ? merged : []

  // Page order: an item whose field is further down comes later; items with no field on screen go last.
  const root = bodyRef.current
  const ordered = items
    .map((e) => ({ ...e, target: targetFor(root, e.path) }))
    .sort((a, b) => {
      if (!a.target || !b.target) return a.target ? -1 : b.target ? 1 : 0
      return a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    })

  // Re-runs when the attempt changes or its errors arrive (validation is async); does nothing once that attempt was handled.
  const itemsKey = items.map((i) => `${i.path}|${i.message}`).join('|')
  useEffect(() => {
    if (attempt === 0 || focusedAttempt.current === attempt || items.length === 0) return
    const firstInvalid = focusableIn(bodyRef.current?.querySelector('[aria-invalid="true"]') ?? null)
    const byPath = items.map((i) => targetFor(bodyRef.current, i.path)).find(Boolean)
    const target = firstInvalid ?? byPath ?? summaryRef.current
    if (!target) return
    target.focus()
    focusedAttempt.current = attempt
    // `items` is read through itemsKey, which changes whenever they do.
  }, [attempt, itemsKey])

  const onContinue = () => {
    setAttempt((n) => n + 1)
    props.onContinue()
  }

  const count = ordered.length
  const showSummary = hasServer || count >= SUMMARY_MIN_ERRORS || ordered.some((e) => !e.target)
  return (
    <BookingFormStep onCancel={cancel} onBack={stepIndex > 0 ? back : undefined} onContinue={onContinue} continueLabel={props.continueLabel} continueDisabled={props.continueDisabled}>
      {/* While the summary is up it is the one announcement; the field errors stay visible and linked. */}
      <FieldErrorAlertContext.Provider value={!showSummary}>
      <div ref={bodyRef} data-step-body>
        {showSummary && (
          <div
            ref={summaryRef}
            role="alert"
            tabIndex={-1}
            aria-labelledby="step-error-summary-title"
            className="mb-5 rounded-2xl border border-danger bg-status-rejected-bg p-4 text-sm text-status-rejected-fg outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <h2 id="step-error-summary-title" className="mb-1 flex items-center gap-2 font-semibold">
              <AlertCircle size={16} aria-hidden="true" />
              {hasServer ? 'The parish system could not accept this step' : `Check ${count} answer${count === 1 ? '' : 's'}`}
            </h2>
            <p className="mb-2">Your answers are kept. Fix what is marked, then press Continue.</p>
            <details open={hasServer} className="group">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-focus">
                Show what to fix
              </summary>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {ordered.map((e) => (
                <li key={`${e.path}-${e.message}`}>
                  {e.target ? (
                    <a
                      href={`#${e.path}`}
                      onClick={(ev) => {
                        ev.preventDefault()
                        targetFor(bodyRef.current, e.path)?.focus()
                      }}
                      className="font-medium underline underline-offset-2"
                    >
                      {e.message}
                    </a>
                  ) : (
                    e.message
                  )}
                </li>
              ))}
            </ul>
            </details>
          </div>
        )}
        {props.children}
      </div>
      </FieldErrorAlertContext.Provider>
    </BookingFormStep>
  )
}
