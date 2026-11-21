import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { AlertCircle, CircleCheck, Clock, Minus, X, type LucideIcon } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useIsPhone } from '../../lib/hooks/useIsPhone'
import { cn } from '../../lib/utils'
import type { PillTone } from './bookingModel'

export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/** The white card every section sits in. */
export const CARD = 'rounded-2xl border border-line bg-surface'
/** A section heading inside a card. */
export const H2 = 'font-display text-[20px] font-semibold text-navy'

/** Outline buttons and fields use the input border (3:1 on white), never the pale line colour. */
export const OUTLINE_BTN = 'rounded-xl border border-input-border bg-surface text-[15px] font-semibold text-navy hover:bg-paper'
export const DANGER_OUTLINE_BTN = 'rounded-xl border border-danger bg-surface text-[15px] font-semibold text-danger hover:bg-status-rejected-bg'
export const FIELD = 'w-full rounded-xl border border-input-border bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-muted'
export const TEXTAREA = `${FIELD} py-3 leading-normal`
export const INPUT = `${FIELD} h-12`

/** One class string per tone, so a pill's text colour and its fill always travel together. */
const PILL: Record<PillTone, string> = {
  pending: 'bg-status-pending-bg text-status-pending-fg',
  confirmed: 'bg-status-confirmed-bg text-status-confirmed-fg',
  done: 'bg-status-done-bg text-status-done-fg',
  rejected: 'bg-status-rejected-bg text-status-rejected-fg',
  neutral: 'bg-paper-deep text-ink',
}

const PILL_ICON: Record<'clock' | 'check' | 'none' | 'alert', LucideIcon> = { clock: Clock, check: CircleCheck, none: Minus, alert: AlertCircle }

/** A small status pill: icon plus words, so colour is never the only signal. */
export function Pill({ tone, icon, children, className }: { tone: PillTone; icon: keyof typeof PILL_ICON; children: ReactNode; className?: string }) {
  const Icon = PILL_ICON[icon]
  return (
    <span className={cn('inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-medium', PILL[tone], className)}>
      <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
      {children}
    </span>
  )
}

/** The labelled text area / field row the dialogs share: "Reason  Required". */
export function FieldLabel({ htmlFor, children, hint = 'Required' }: { htmlFor: string; children: ReactNode; hint?: 'Required' | 'Optional' | null }) {
  return (
    <label htmlFor={htmlFor} className="text-[14px] font-medium text-ink">
      {children}
      {hint && <span className="ml-1.5 font-normal text-ink-muted">{hint}</span>}
    </label>
  )
}

/** An error written as an instruction, tied to its field by id. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="text-[14px] font-medium text-danger">
      {children}
    </p>
  )
}

const CLOSE_BTN = `flex size-11 shrink-0 items-center justify-center rounded-[10px] text-navy hover:bg-paper ${FOCUS}`

/**
 * One shell for every booking action: a centred dialog on desktop and a bottom sheet on a phone, with the same
 * title, reason and buttons in both. Radix keeps focus inside, closes on Escape and gives focus back to the opener.
 * `footer` holds the buttons in reading order (cancel, then confirm); on a phone they stack with confirm on top.
 */
export function ActionShell({
  open,
  onOpenChange,
  title,
  description,
  label,
  children,
  footer,
  width = 520,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  label?: string
  children: ReactNode
  footer: ReactNode
  width?: 520 | 560
}) {
  const phone = useIsPhone()
  const head = (Title: typeof DialogTitle | typeof SheetTitle, Desc: typeof DialogDescription | typeof SheetDescription, Close: typeof DialogClose | typeof SheetClose) => (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Title className="mb-1.5 font-display text-[24px] font-semibold leading-tight text-navy">{title}</Title>
        {description ? <Desc className="text-[14px] leading-normal text-ink-muted">{description}</Desc> : <Desc className="sr-only">{label ?? title}</Desc>}
      </div>
      <Close className={`-mr-2 -mt-1.5 ${CLOSE_BTN}`} aria-label="Close">
        <X size={22} aria-hidden="true" />
      </Close>
    </div>
  )

  if (phone) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" showCloseButton={false} className="max-h-[92vh] gap-4 overflow-y-auto rounded-t-[20px] bg-paper px-4 pb-6 pt-2.5">
          <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-sm bg-hollow" />
          {head(SheetTitle, SheetDescription, SheetClose)}
          {children}
          <div className="flex flex-col-reverse gap-2.5 pt-2 [&>*]:w-full">{footer}</div>
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={cn('gap-4 rounded-2xl border border-line bg-surface p-6 sm:max-w-[520px]', width === 560 && 'sm:max-w-[560px]')}>
        {head(DialogTitle, DialogDescription, DialogClose)}
        {children}
        <div className="flex justify-end gap-2.5 pt-2">{footer}</div>
      </DialogContent>
    </Dialog>
  )
}

export interface TabDef<T extends string> {
  key: T
  label: string
  count?: number | string
}

/**
 * An underline tab bar (the queue's views, the notes and history switch). Arrow keys, Home and End move between
 * tabs and select as they go; only the selected tab is in the tab order. `value` may be null when none applies.
 */
export function TabBar<T extends string>({
  label,
  tabs,
  value,
  onChange,
  className,
  idPrefix,
}: {
  label: string
  tabs: ReadonlyArray<TabDef<T>>
  value: T | null
  onChange: (key: T) => void
  className?: string
  idPrefix?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const current = tabs.findIndex((t) => t.key === value)
  function onKey(e: KeyboardEvent) {
    const last = tabs.length - 1
    const from = current < 0 ? 0 : current
    const to = e.key === 'ArrowRight' ? (from === last ? 0 : from + 1) : e.key === 'ArrowLeft' ? (from === 0 ? last : from - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1
    if (to < 0) return
    e.preventDefault()
    onChange(tabs[to].key)
    refs.current[to]?.focus()
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className={cn('flex gap-x-7 border-b border-line', className)}>
      {tabs.map((t, i) => {
        const on = t.key === value
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-${t.key}` : undefined}
            aria-selected={on}
            tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              '-mb-px inline-flex min-h-12 shrink-0 items-center gap-2 border-b-[3px] text-[15px]',
              FOCUS,
              on ? 'border-navy font-semibold text-navy' : 'border-transparent font-medium text-ink-muted hover:text-navy',
            )}
          >
            {t.label}{' '}
            {t.count !== undefined && <span className="text-[13px] tabular-nums text-ink-muted">{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
