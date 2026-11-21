import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { cn } from '../../lib/utils'

interface AppHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
  action?: ReactNode
  /** `web`: the desktop page heading block (set by the website frame); the default is the phone header. */
  variant?: 'phone' | 'web'
}

/**
 * Phone header: the page title, its line of context, one action. Solid paper, no mark, no glass.
 */
export function AppHeader({ title, subtitle, onBack, action, variant = 'phone' }: AppHeaderProps) {
  if (variant === 'web') {
    // A desktop page opens with a plain heading, not a bar: the top bar is already the chrome.
    return (
      <div className="flex items-center gap-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-navy hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-title font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-note text-ink-muted">{subtitle}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2 text-ink">{action}</div>}
      </div>
    )
  }
  // A page's entry: one large Fraunces title, its line of context, the action at the right. A page with a back
  // button gets the same header at the smaller title size and a hairline under it.
  return (
    <header
      className={cn(
        'flex flex-wrap items-start gap-x-3 gap-y-1 bg-paper px-5 pb-3 pt-4',
        onBack && 'items-center border-b border-line px-4 py-3',
      )}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-navy hover:bg-line/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      )}
      <div className="min-w-[9rem] flex-1 [overflow-wrap:anywhere]">
        <h1 className={cn('font-display font-semibold text-navy', onBack ? 'text-[1.375rem] leading-7' : 'text-display-xl')}>{title}</h1>
        {subtitle && <p className="mt-1 text-note text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="ml-auto flex shrink-0 items-center text-navy">{action}</div>}
    </header>
  )
}
