import { BadgeCheck, CheckCheck, CircleAlert, CircleDashed, Clock, Ban, XCircle, type LucideIcon } from 'lucide-react'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'
import { STATUS_LABEL, STATUS_STYLE } from '../../lib/domain'
import type { BookingStatus } from '../../lib/types'

/** One icon per status so colour is never the only signal. */
const STATUS_ICON: Record<BookingStatus, LucideIcon> = {
  draft: CircleDashed,
  submitted: Clock,
  returned: CircleAlert,
  approved: BadgeCheck,
  completed: CheckCheck,
  declined: XCircle,
  cancelled: Ban,
}

/** A booking status as a pill: token colour pair, icon and text label. At least 32 px tall; the label wraps rather than widening the page. */
export function StatusPill({ status, className }: { status: BookingStatus; className?: string }) {
  const Icon = STATUS_ICON[status]
  return (
    <Badge
      className={cn(
        'min-h-8 max-w-full gap-1.5 rounded-full px-3 py-0.5 text-note font-semibold whitespace-normal [&>svg]:size-[18px]',
        STATUS_STYLE[status],
        className,
      )}
    >
      <Icon aria-hidden="true" />
      {STATUS_LABEL[status]}
    </Badge>
  )
}
