import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * The mark at the top of a result page: a round seal with its meaning drawn inside. `done` is the register seal
 * (gold ring, dotted inner ring, navy check); `wait` and `stop` are plain navy and muted rings. Decorative: the
 * heading under it always says the result in words.
 */
export function ResultMark({ tone, icon: Icon }: { tone: 'done' | 'wait' | 'stop'; icon: LucideIcon }) {
  return (
    <span
      data-slot="result-mark"
      data-tone={tone}
      aria-hidden="true"
      className={cn(
        'relative grid size-[84px] shrink-0 place-items-center rounded-full border-2 bg-surface',
        tone === 'done' && 'border-gold text-navy before:absolute before:inset-[5px] before:rounded-full before:border-[1.5px] before:border-dotted before:border-gold',
        tone === 'wait' && 'border-navy text-navy',
        tone === 'stop' && 'border-hollow text-ink-muted',
      )}
    >
      <Icon size={36} strokeWidth={tone === 'done' ? 3 : 2} />
    </span>
  )
}
