import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Any address the admin portal does not have: say so plainly and offer the way back. */
export function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-4 bg-paper p-6 text-center">
      <Compass size={40} aria-hidden="true" className="text-navy" />
      <h1 className="font-display text-title font-semibold text-navy">This page does not exist</h1>
      <p className="text-body text-ink-muted">The address may be mistyped, or the page may have moved.</p>
      <Link
        to="/dashboard"
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-navy px-6 text-body font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Go to the dashboard
      </Link>
    </div>
  )
}
