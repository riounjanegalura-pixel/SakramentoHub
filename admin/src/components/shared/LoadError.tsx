import { Button } from '@/components/ui/button'
import { cn } from '../../lib/utils'

/**
 * A failed load, in words, with a retry that asks the server again. With a `title` it is the full-page form (a heading in the danger colour, the message, one filled button); without, the compact card used inside
 * screens that have more to show.
 */
export function LoadError({ message, onRetry, className, title, detail }: { message: string; onRetry: () => void; className?: string; title?: string; detail?: string }) {
  if (title) {
    return (
      <section role="alert" className={cn('max-w-[560px] rounded-2xl border border-line bg-surface p-8', className)}>
        <h2 className="mb-2 font-display text-[22px] font-semibold text-danger">{title}</h2>
        <p className={cn('text-[15px] leading-normal text-ink-muted', detail ? 'mb-1' : 'mb-5')}>{message}</p>
        {detail && <p className="mb-5 text-[13px] text-ink-muted">{detail}</p>}
        <Button type="button" className="min-h-12 rounded-xl px-6 text-[15px]" onClick={onRetry}>
          Try again
        </Button>
      </section>
    )
  }
  return (
    <div className={cn('rounded-2xl border border-line bg-surface p-5', className)}>
      <p role="alert" className="text-sm font-medium text-danger">
        {message}
      </p>
      <p className="mt-1 text-sm text-ink-muted">Check your connection and try again.</p>
      <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
