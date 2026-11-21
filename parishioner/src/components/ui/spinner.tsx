import { Loader2 } from "lucide-react"

/** The one loading spinner. Decorative: whatever is loading says so in words elsewhere (a busy button, a status line). */
function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />
}

export { Spinner }
