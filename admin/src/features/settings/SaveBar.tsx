import { useEffect, useRef } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { BTN_OUTLINE, BTN_PRIMARY } from '../register/registerForm'

/**
 * The foot of one settings form: its own Save button, a text warning while there are unsaved edits,
 * a role="status" message that names what was saved, and the refusal as a role="alert" that takes focus
 * so a keyboard or screen-reader user lands on it. The gold primary is shown only while there is
 * something to save, so a tab with several cards never carries several gold buttons at rest.
 */
export function SaveBar({
  label,
  dirty,
  pending,
  savedMessage,
  error,
  onSave,
  onDiscard,
}: {
  label: string
  dirty: boolean
  pending: boolean
  /** Set (non-empty) while the last save is the thing the person last did. */
  savedMessage: string | null
  error: Error | null
  onSave: () => void
  /** Puts the form back to what is saved. Offered only while there are unsaved edits. */
  onDiscard?: () => void
}) {
  const alertRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (error) alertRef.current?.focus()
  }, [error])

  return (
    <div className="sticky bottom-3 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
      <button type="button" disabled={!dirty || pending} onClick={onSave} className={`${dirty ? BTN_PRIMARY : BTN_OUTLINE} max-md:w-full`}>
        {label}
      </button>
      {dirty && onDiscard && (
        <button type="button" disabled={pending} onClick={onDiscard} className={`${BTN_OUTLINE} max-md:w-full`}>
          Discard changes
        </button>
      )}
      {dirty && !pending && !savedMessage && (
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <CircleAlert size={16} aria-hidden="true" />
          You have unsaved changes.
        </p>
      )}
      {savedMessage && (
        <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-status-done-fg">
          <CircleCheck size={16} aria-hidden="true" />
          {savedMessage}
        </p>
      )}
      {error && (
        <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm font-medium text-danger outline-none focus-visible:outline-2 focus-visible:outline-focus">
          {error.message}
        </p>
      )}
    </div>
  )
}
