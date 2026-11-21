import { CircleCheck, CircleAlert, CircleDashed, Clock, Ban, XCircle, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '../../lib/utils'
import { STATUS_LABEL, STATUS_STYLE } from '../../lib/domain'
import type { BookingStatus } from '../../lib/types'

/** One icon per status so colour is never the only signal. */
const STATUS_ICON: Record<BookingStatus, LucideIcon> = {
  draft: CircleDashed,
  submitted: Clock,
  returned: CircleAlert,
  approved: CircleCheck,
  completed: CircleCheck,
  declined: XCircle,
  cancelled: Ban,
}

/** A booking status as a pill: token colour pair, icon and text label. It never wraps. */
export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const Icon = STATUS_ICON[status]
  return (
    <Badge className={cn('h-[26px] gap-1.5 rounded-full px-2.5 py-0 text-[13px] font-medium max-w-full whitespace-nowrap [&>svg]:size-3.5', STATUS_STYLE[status], className)}>
      <Icon aria-hidden="true" />
      {STATUS_LABEL[status]}
    </Badge>
  )
}
