import type { ComponentType, ReactNode } from 'react'

/**
 * One look for "nothing here yet": a soft icon, a plain title, a line on what happens next, and an optional action.
 * The title is the sentence a screen reader reads, so it says the whole thing.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className = '',
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' }>
  title: string
  hint?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center gap-2 px-6 py-10 text-center ${className}`}>
      <span aria-hidden="true" className="mb-1 flex size-12 items-center justify-center rounded-full bg-line/50 text-navy">
        <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <p className="font-display text-[1.1875rem] font-semibold leading-snug text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm leading-normal text-ink-muted">{hint}</p>}
      {action}
    </div>
  )
}
