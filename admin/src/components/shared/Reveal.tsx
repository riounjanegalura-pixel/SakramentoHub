import type { ReactNode } from 'react'

/** Kept as a plain wrapper: admin pages appear at once, with no fade or lift. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}
