import type { ReactNode } from 'react'

export const inputClass =
  'rounded-xl border border-input-border bg-surface p-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:bg-paper disabled:text-ink-muted'

export function Field({ label, htmlFor, children, className = '' }: { label: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{label}</label>
      {children}
    </div>
  )
}

export const ADMIN_ONLY_NOTE = 'Only an administrator can change this page. You can read it.'
