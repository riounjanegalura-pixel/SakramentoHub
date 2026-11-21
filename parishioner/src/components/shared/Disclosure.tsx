import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * A collapsible group of fields. The content stays in the DOM when closed, so registered inputs keep their values.
 * `defaultOpen` (an answer already inside) only sets the first state, so a person can fold it away and it stays folded.
 * `forceOpen` (a problem inside) opens it when the problem appears and shows it for as long as the problem lasts.
 */
export function Disclosure({ summary, defaultOpen = false, forceOpen = false, children }: { summary: ReactNode; defaultOpen?: boolean; forceOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen || forceOpen)
  const [wasForced, setWasForced] = useState(forceOpen)

  // Adjusted while rendering, not in an effect: the field must be shown in the same commit that StepFrame moves focus
  // to it, and it must not fold away under the cursor when the problem clears as the person fixes it.
  if (forceOpen !== wasForced) {
    setWasForced(forceOpen)
    if (forceOpen) setOpen(true)
  }

  return (
    <details open={open || forceOpen} className="group mb-2">
      <summary
        onClick={(e) => {
          // React owns the state; the browser's own toggle would drift from it.
          e.preventDefault()
          setOpen(!(open || forceOpen))
        }}
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden"
      >
        <ChevronDown size={16} aria-hidden="true" className="-rotate-90 group-open:rotate-0" />
        {summary}
      </summary>
      {children}
    </details>
  )
}
