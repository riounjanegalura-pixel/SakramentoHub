import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * The register seal: an outlined gold ring around a navy check, with its meaning in words.
 * It marks an entry that has been recorded or a certificate that has been issued. Gold here is decoration only:
 * the label always says what the seal means.
 */
export function Seal({ label, detail, className }: { label: string; detail?: string; className?: string }) {
  return (
    <p data-testid="seal" className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-gold bg-surface text-navy"
      >
        <Check size={20} strokeWidth={3} />
      </span>
      <span className="min-w-0">
        <span className="block text-body font-semibold text-ink">{label}</span>
        {detail && <span className="numeric block text-note text-ink-muted">{detail}</span>}
      </span>
    </p>
  )
}
