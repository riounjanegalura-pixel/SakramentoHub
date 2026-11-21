import { createContext, useContext, useEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { Eye, EyeOff } from 'lucide-react'
import crest from '../../assets/crest-sm.png'
import { Input } from '../../components/ui/input'
import { ApiError } from '../../lib/api/client'
import { cn } from '../../lib/utils'

/** Focus ring for plain links and buttons on a light surface (spec section 10: always visible). */
export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/** A text link: navy, underlined, a 44 px target. Used for "Forgot password?" and the other secondary routes. */
export const TEXT_LINK = cn('inline-flex min-h-11 items-center text-sm font-semibold text-navy underline underline-offset-4', FOCUS)

/** A native select drawn like `Input`: same border, height, focus and invalid treatment. */
export const NATIVE_SELECT =
  'min-h-[44px] w-full min-w-0 rounded-xl border border-input-border bg-surface px-3 py-2 text-base text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger md:text-sm'

/** True inside the desktop split: the brand panel is already beside the form, so the page is just the form. */
export const AuthSplitContext = createContext(false)

interface AuthPageProps {
  title: string
  subtitle?: ReactNode
  children: ReactNode
}

/**
 * The frame of every sign-in-side screen: one title, one form.
 * Phone: the wordmark, a large Fraunces title and the form on paper. Desktop (inside WebAuthSplit): the brand panel is
 * beside it, so this is only the heading and a card on the paper column.
 */
export function AuthPage({ title, subtitle, children }: AuthPageProps) {
  const inSplit = useContext(AuthSplitContext)

  if (inSplit) {
    return (
      <div className="mx-auto w-full max-w-md px-8 py-16">
        <h1 className="font-display text-display font-semibold text-navy">{title}</h1>
        {subtitle && <p className="mt-2 text-base text-ink-muted">{subtitle}</p>}
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6">{children}</div>
      </div>
    )
  }

  return (
    <main className="flex min-h-screen flex-col bg-paper px-6 pb-10 pt-6 text-ink">
      <p className="flex items-center gap-3 font-display text-heading font-semibold text-navy">
        <img src={crest} alt="" aria-hidden="true" className="h-10 w-auto" />
        SakramentoHub
      </p>
      <header className="mb-6 mt-10">
        <h1 className="font-display text-display font-semibold text-navy">{title}</h1>
        {subtitle && <p className="mt-2 text-body text-ink-muted">{subtitle}</p>}
      </header>
      {children}
    </main>
  )
}

interface PasswordInputProps extends Omit<ComponentProps<'input'>, 'type'> {
  show: boolean
  /** Present on the field that carries the show/hide control; a confirmation field follows it without its own. */
  onToggle?: () => void
}

/**
 * A password input with an optional show/hide control. `Field` hands this its id and aria attributes, which go to
 * the input; the control is a real button with a name and a 44 px target.
 */
export function PasswordInput({ show, onToggle, className, ...props }: PasswordInputProps) {
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className={cn(onToggle && 'pr-12', className)} />
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? 'Hide password' : 'Show password'}
          className={cn('absolute right-0 top-0 flex size-11 items-center justify-center rounded-xl text-ink-muted', FOCUS)}
        >
          {show ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      )}
    </div>
  )
}

/**
 * The summary of a refusal that is about the whole form (or the server's reason). It announces itself, and takes
 * focus unless a field has just taken it.
 */
export function FormAlert({ message, takeFocus }: { message: string; takeFocus: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (takeFocus) ref.current?.focus()
  }, [takeFocus, message])
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={cn('rounded-xl border border-danger bg-status-rejected-bg p-3 text-sm font-medium text-status-rejected-fg outline-none', FOCUS)}
    >
      {message}
    </div>
  )
}

/** Laravel names that differ from the form's field names. */
const SERVER_ALIASES: Record<string, string> = { password_confirmation: 'passwordConfirmation' }

/**
 * Puts a server refusal where it belongs: each message the server attached to a field goes on that field (the first
 * one takes focus); the summary text is returned for a FormAlert. `mapped` says whether a field took the focus.
 */
export function useServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): { message: string | null; mapped: boolean } {
  const fieldMessages =
    error instanceof ApiError
      ? Object.entries(error.fieldErrors)
          .map(([key, msgs]) => [SERVER_ALIASES[key] ?? key, msgs[0]] as const)
          .filter(([name, msg]) => !!msg && fields.includes(name))
      : []

  useEffect(() => {
    fieldMessages.forEach(([name, msg], i) => {
      setError(name as Path<T>, { type: 'server', message: msg }, { shouldFocus: i === 0 })
    })
    // Runs once per refusal; fieldMessages is derived from `error`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  const message = error ? (error instanceof Error && error.message ? error.message : 'Something went wrong. Try again.') : null
  return { message, mapped: fieldMessages.length > 0 }
}

/**
 * The live status of a request in flight: what is happening, and after a few seconds the honest note about a
 * sleeping server. Mounted only while there is something to say.
 *
 * What is happening is announced to screen readers only: the submit button beside it already shows a spinner and
 * its own "Creating Account…" label, so printing the same sentence again above it read as a doubled message.
 */
export function PendingStatus({ pending, slow, children }: { pending: boolean; slow: boolean; children: ReactNode }) {
  if (!pending) return null
  return (
    <div role="status" className="text-sm text-ink-muted">
      <p className="sr-only">{children}</p>
      {slow && <p className="mt-1 text-ink">Waking up the server — this can take up to a minute on the first try.</p>}
    </div>
  )
}
