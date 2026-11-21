import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[44px] w-full rounded-xl border border-input-border bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
