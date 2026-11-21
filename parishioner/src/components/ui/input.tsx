import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-[44px] w-full min-w-0 rounded-xl border border-input-border bg-surface px-3 py-2 text-base text-ink selection:bg-gold selection:text-navy file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-ink-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
