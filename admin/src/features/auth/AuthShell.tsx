import type { ReactNode } from 'react'
import crest from '../../assets/crest-sm.png'

const STEPS = ['Requested', 'Under review', 'Paid', 'Confirmed', 'Completed'] as const

/** One step of the booking rail on the navy panel. "Under review" is where the office comes in. */
function Step({ label, index }: { label: string; index: number }) {
  const last = index === STEPS.length - 1
  return (
    <li className={`relative flex gap-4 ${last ? '' : 'pb-[26px]'}`}>
      {!last && <span aria-hidden="true" className="absolute bottom-0 left-[9px] top-[22px] w-0.5 bg-white/30" />}
      {index === 0 && <span aria-hidden="true" className="mt-px size-5 shrink-0 rounded-full bg-white" />}
      {index === 1 && (
        <span aria-hidden="true" className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-white">
          <span className="size-2 rounded-full bg-gold" />
        </span>
      )}
      {index > 1 && <span aria-hidden="true" className="mt-px size-5 shrink-0 rounded-full border-2 border-white/60" />}
      <span className={`text-[16px] leading-[22px] ${index === 1 ? 'font-semibold' : index === 0 ? '' : 'text-white/80'}`}>
        {label}
        {index === 1 && <span className="ml-2 text-[13px] font-normal text-gold">Where you come in</span>}
      </span>
    </li>
  )
}

/**
 * The two-panel frame every signed-out admin screen sits in: the navy brand panel with the booking rail
 * on the left, the form on the right. It wraps on a phone, so the navy panel stacks above the form.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-wrap bg-paper text-ink">
      <aside className="flex min-w-0 flex-[1_1_520px] flex-col justify-between gap-14 bg-navy px-6 py-8 text-white md:px-16 md:py-14">
        <div className="flex items-center gap-3.5">
          <div className="flex rounded-xl bg-surface px-2 py-1.5">
            <img src={crest} alt="" aria-hidden="true" className="h-[42px] w-[34px] object-contain" />
          </div>
          <div>
            <p className="font-display text-[22px] font-semibold leading-[1.1]">SakramentoHub</p>
            <p className="mt-[3px] text-[13px] text-white/80">Parish office</p>
          </div>
        </div>
        <div className="hidden md:block">
          <p className="mb-10 max-w-[460px] font-display text-[44px] font-semibold leading-[1.1]">Every booking, one step at a time.</p>
          <ol className="m-0 list-none p-0">
            {STEPS.map((s, i) => (
              <Step key={s} label={s} index={i} />
            ))}
          </ol>
        </div>
        <div className="hidden md:block" />
      </aside>
      <main className="flex min-w-0 flex-[1_1_480px] items-center justify-center px-8 py-12">
        <div className="w-full max-w-[384px]">{children}</div>
      </main>
    </div>
  )
}

export const AUTH_H1 = 'font-display text-[32px] font-semibold leading-[1.15] text-navy'
export const AUTH_INPUT =
  'h-12 w-full rounded-xl border border-input-border bg-surface px-3.5 text-[16px] text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger'
export const AUTH_PRIMARY =
  'flex h-[52px] w-full items-center justify-center rounded-xl bg-navy text-[16px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50'
export const AUTH_LINK =
  'inline-flex min-h-11 items-center text-[14px] font-semibold text-navy underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/** "Email address  Required" label, with Required in words. */
export function AuthLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[14px] font-medium">
      {children} <span className="font-normal text-ink-muted">Required</span>
    </label>
  )
}

export function SlowNotice() {
  return (
    <p role="status" className="rounded-xl bg-status-confirmed-bg px-3.5 py-3 text-[14px] leading-[1.45] text-navy">
      Waking up the server. This can take up to a minute on the first try.
    </p>
  )
}
