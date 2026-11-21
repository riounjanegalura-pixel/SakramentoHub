import type { ReactNode } from 'react'

/** Form pieces shared by the register dialogs, sized as designed (48 px fields, 12 px radius, "Required" in words). */
export const REG_INPUT =
  'h-12 w-full rounded-xl border border-input-border bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger'
export const REG_INPUT_SM = REG_INPUT.replace('h-12', 'h-11')
export const REG_TEXTAREA =
  'w-full rounded-xl border border-input-border bg-surface px-3.5 py-3 text-[15px] leading-normal text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
export const BTN_OUTLINE =
  'inline-flex h-12 items-center justify-center rounded-xl border border-input-border bg-surface px-[22px] text-[15px] font-semibold text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50'
export const BTN_PRIMARY =
  'inline-flex h-12 items-center justify-center rounded-xl bg-navy px-[22px] text-[15px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50'
export const BTN_DANGER =
  'inline-flex h-12 items-center justify-center rounded-xl bg-danger px-[22px] text-[15px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50'
export const TEXT_LINK =
  'inline-flex min-h-11 items-center text-[14px] font-semibold text-navy underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/** A label with "Required" written out, then the control, then its error. */
export function RegField({
  label,
  htmlFor,
  required = false,
  optional = false,
  error,
  className = '',
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  optional?: boolean
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-[14px] font-medium">
        {label}
        {required && <span className="font-normal text-ink-muted"> Required</span>}
        {optional && <span className="font-normal text-ink-muted"> Optional</span>}
      </label>
      {children}
      {error ? <p className="text-[14px] text-danger">{error}</p> : null}
    </div>
  )
}

/** Dialog frame classes: a centred 16 px card on a desktop, a bottom sheet on a phone. */
export const REG_DIALOG =
  'gap-4 rounded-2xl p-6 sm:max-w-[640px] max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:m-0 max-md:max-h-[92vh] max-md:max-w-full max-md:rounded-b-none max-md:rounded-t-[20px] max-md:bg-paper max-md:px-4'
export const REG_DIALOG_NARROW = REG_DIALOG.replace('sm:max-w-[640px]', 'sm:max-w-[520px]')
