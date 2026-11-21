import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { AdminAnalytics, DayCount } from '../../lib/types'
import { cn } from '../../lib/utils'

/**
 * A panel whose data cannot be shown (the server answered in an older shape, or a panel threw while drawing). It names
 * the panel and says what to do, and the rest of the dashboard keeps working.
 */
export function PanelUnavailable({ title, onRetry, className }: { title: string; onRetry?: () => void; className?: string }) {
  return (
    <section aria-label={title} className={cn('min-w-0 rounded-2xl border border-line bg-surface px-6 py-5', className)}>
      <h2 className="mb-1.5 font-display text-[22px] font-semibold text-navy">{title}</h2>
      <p role="alert" className="text-[14px] font-medium text-danger">
        {title} can't be shown right now.
      </p>
      <p className="mt-1 text-[13px] text-ink-muted">
        The server sent this part in a format the page doesn't expect, which usually means the server is being updated. Try again in a minute; the rest of the dashboard is unaffected.
      </p>
      {onRetry && (
        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </section>
  )
}

interface Props {
  title: string
  onRetry?: () => void
  className?: string
  children: ReactNode
}

/** Catches a panel that throws while drawing, so one bad panel never takes the whole route down. */
export class PanelBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`Dashboard panel "${this.props.title}" failed`, error)
  }

  render() {
    if (this.state.failed) {
      return (
        <PanelUnavailable
          title={this.props.title}
          className={this.props.className}
          onRetry={() => {
            this.setState({ failed: false })
            this.props.onRetry?.()
          }}
        />
      )
    }
    return this.props.children
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isDayCounts = (v: unknown): v is DayCount[] => Array.isArray(v) && v.every((d) => d && typeof d.date === 'string' && isNum(d.count))

/** Which parts of an analytics response are in the shape this page reads. */
export function analyticsShape(data: Partial<AdminAnalytics> | undefined) {
  const a = data?.attention as Partial<Record<string, unknown>> | undefined
  const attention = !!a && ['awaitingReview', 'certificateRequests', 'refundDue', 'holdsExpiringSoon'].every((k) => isNum(a[k]))
  return {
    attention,
    waiting: attention && Array.isArray(data?.waitingPreview),
    ahead: isDayCounts(data?.visitsAhead),
    bookings: isDayCounts(data?.bookingsPerDay),
    dueSoon: Array.isArray(data?.dueSoon),
  }
}
