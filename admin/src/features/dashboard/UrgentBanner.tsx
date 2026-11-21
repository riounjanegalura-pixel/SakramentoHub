import { Link } from 'react-router-dom'
import { CircleAlert, Phone } from 'lucide-react'
import type { UnscheduledRequest } from '../../lib/types'
import { cn } from '../../lib/utils'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * Open emergency anointings have no appointment, so a calendar would never show them. The word "Urgent" and the icon
 * carry the meaning; the Call button rings the family. One row per request, each with its own phone link.
 */
export function UrgentBanner({ requests, compact }: { requests: UnscheduledRequest[]; compact: boolean }) {
  if (requests.length === 0) return null
  return (
    <section aria-label="Priority request" className="flex flex-col gap-2 rounded-2xl border border-danger/25 bg-status-rejected-bg px-5 py-3 text-status-rejected-fg max-md:px-4">
      {requests.map((r) => {
        const tel = r.contactPhone ? `tel:${r.contactPhone.replace(/[^\d+]/g, '')}` : null
        return (
          <div key={r.id} className={cn('flex items-center gap-x-5 gap-y-3', compact ? 'flex-nowrap gap-3' : 'flex-wrap')}>
            <span className="inline-flex shrink-0 items-center gap-2 text-[15px] font-semibold max-md:text-[14px]">
              <CircleAlert size={compact ? 16 : 20} aria-hidden="true" />
              Urgent
            </span>
            <Link to={`/bookings/${r.id}`} className={cn('min-w-0 flex-1 rounded-md text-[15px] text-ink no-underline hover:underline max-md:text-[14px]', !compact && 'basis-60', FOCUS)}>
              {r.subjectName} needs an anointing
            </Link>
            {tel ? (
              <a
                href={tel}
                aria-label={`Call ${r.contactPhone}`}
                className={cn('inline-flex shrink-0 items-center gap-2 rounded-xl bg-navy px-[18px] text-[15px] font-semibold text-white', compact ? 'h-12 px-4' : 'h-11', FOCUS)}
              >
                <Phone size={18} aria-hidden="true" />
                Call
              </a>
            ) : (
              <span className="shrink-0 text-[14px] text-ink">No phone number</span>
            )}
          </div>
        )
      })}
    </section>
  )
}
