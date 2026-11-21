import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Service } from '../../lib/types'
import { feeText, hasFee, leadLabel } from '../../features/services/serviceText'
import { Emblem } from './Emblem'

/**
 * One sacrament as a ruled row: icon, name, what you need to know to start (lead time),
 * and the fee only where there is one, quietly, exactly as the parish quotes it. The whole row is the link and
 * opens the service page, never the wizard. The fee is never a total: per-sponsor stays "per sponsor".
 */
export function ServiceRow({ service, showFee = true }: { service: Service; showFee?: boolean }) {
  return (
    <Link
      to={`/services/${service.id}`}
      className="flex min-h-[72px] items-center gap-4 py-3 text-ink hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
    >
      <Emblem kind={service.sacrament} size="sm" />
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <span className="block text-[1.1875rem] leading-snug font-semibold">{service.name}</span>
        <span className="block text-note text-ink-muted">{leadLabel(service)}</span>
        {showFee && hasFee(service) && <span className="block text-note text-ink-muted tabular-nums">Fee: {feeText(service)}</span>}
      </span>
      <ChevronRight className="size-[22px] shrink-0 text-navy" aria-hidden="true" />
    </Link>
  )
}
