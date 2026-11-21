import { Phone } from 'lucide-react'
import { useParishInfo } from '../../lib/useParishInfo'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

/**
 * The emergency route: a quiet row, not an alarm. The number comes only from the parish record;
 * with no phone on file the row is not drawn, so it can never show a wrong number.
 */
export function EmergencyCallRow({ className, bare = false }: { className?: string; bare?: boolean }) {
  const { data } = useParishInfo()
  const phone = data?.phone
  if (!phone) return null
  if (bare) {
    // Inside the urgent block on Book: the question as a heading, the way to call under it, no card of its own.
    return (
      <section aria-label="Urgent help" data-testid="emergency-call" className={cn('flex flex-col gap-3', className)}>
        <p className="font-display text-[1.375rem] leading-[1.25] font-semibold text-navy">Need a priest right now?</p>
        <p className="text-body text-ink">For the Anointing of the Sick or a death in the family, call the parish office.</p>
        <Button asChild size="lg" className="w-full">
          <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="flex-wrap">
            <Phone aria-hidden="true" />
            Call <span className="tabular-nums">{phone}</span>
          </a>
        </Button>
      </section>
    )
  }
  return (
    <section
      aria-label="Urgent help"
      data-testid="emergency-call"
      className={cn('flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4', className)}
    >
      <p className="min-w-0 flex-1 basis-52 text-body text-ink">
        <span className="font-semibold">Need a priest right now?</span> For the Anointing of the Sick or a death in the family, call the parish office.
      </p>
      <Button asChild variant="outline" className="w-full sm:w-auto">
        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="flex-wrap">
          <Phone aria-hidden="true" />
          Call <span className="tabular-nums">{phone}</span>
        </a>
      </Button>
    </section>
  )
}
