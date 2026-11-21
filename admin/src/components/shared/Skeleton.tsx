import { cn } from '../../lib/utils'

/** A single static placeholder block. Compose these to match the shape of
 * whatever content is loading — never a generic centered spinner, so the
 * page doesn't jump when real content arrives. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('rounded-md bg-line', className)} />
}

/** Mimics BookingsQueueScreen/AuditLogScreen's table shape while data loads. */
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-6 px-4 py-4">
          {Array.from({ length: columns }).map((_, col) => (
            <Skeleton key={col} className={cn('h-4', col === 0 ? 'w-28' : 'flex-1 max-w-40')} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Mimics DashboardScreen's stat-card grid while analytics load. */
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-8 w-12" />
    </div>
  )
}
