import { cn } from '../../lib/utils'

/**
 * Long free text in a table cell: from `sm` up, one line (`truncate`) or two
 * (`line-clamp-2`), capped in width, with the full value in `title`. On phones the
 * DataTable renders each row as a card whose cells wrap, so nothing is clamped
 * there (`title` does nothing on touch). Not for badges or buttons.
 */
export function ClampedText({
  children,
  lines = 1,
  className,
}: {
  children: string | null | undefined
  lines?: 1 | 2
  className?: string
}) {
  if (children == null || children === '') return null
  return (
    <span title={children} className={cn('block min-w-0 break-words sm:max-w-xs', lines === 1 ? 'sm:truncate' : 'sm:line-clamp-2', className)}>
      {children}
    </span>
  )
}
