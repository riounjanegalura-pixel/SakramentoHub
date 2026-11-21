import { cn } from "@/lib/utils"

/** A static placeholder block. No ambient pulse: motion is reserved for meaning. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("max-w-full rounded-md bg-line", className)}
      {...props}
    />
  )
}

export { Skeleton }
