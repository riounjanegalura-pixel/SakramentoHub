import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import type { Service, ServiceRequirements } from '../../lib/types'
import { daysText, feeText, leadLabel, requirementText } from './serviceText'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-3 text-body">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-semibold text-ink [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

/** Fee, lead time, days offered and duration. Every value comes from the service record; none is invented. */
export function ServiceFacts({ service }: { service: Service }) {
  const days = daysText(service)
  return (
    <dl className="divide-y divide-line border-y border-line">
      <Fact label="Fee"><span className="tabular-nums">{feeText(service)}</span></Fact>
      <Fact label="Lead time">{leadLabel(service)}</Fact>
      {days && <Fact label="Days offered">{days}</Fact>}
      <Fact label="Duration">{`${service.durationMinutes} minutes`}</Fact>
    </dl>
  )
}

/** The documents as a real list. `heldKinds` adds a tick to what the parishioner's wallet already holds. */
export function DocumentList({ documents, heldKinds }: { documents: ServiceRequirements['documents']; heldKinds: Set<string> }) {
  if (documents.length === 0) return <p className="text-body text-ink-muted">No documents needed.</p>
  return (
    <ul aria-label="Documents" className="divide-y divide-line border-y border-line">
      {documents.map((doc) => (
        <li key={doc.key} className="flex items-start justify-between gap-3 py-3 text-body">
          <div className="min-w-0">
            <p className="font-semibold text-ink">{doc.label}</p>
            <p className="text-note text-ink-muted">{requirementText(doc)}</p>
          </div>
          {heldKinds.has(doc.walletKind) && doc.walletKind !== 'other' && (
            <span className="flex shrink-0 items-center gap-1 text-note font-semibold text-navy">
              <Check size={16} aria-hidden="true" /> In your documents
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function PrepareList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-body text-ink">
      {items.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  )
}

/** The "Documents to prepare" section with its own loading, error (with Retry) and empty states. */
export function DocumentsSection({
  query,
  heldKinds,
  headingClass = 'text-heading',
}: {
  query: UseQueryResult<ServiceRequirements>
  heldKinds: Set<string>
  headingClass?: string
}) {
  return (
    <section aria-labelledby="docs-heading" className="mb-6">
      <h2 id="docs-heading" className={`mb-2 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink ${headingClass}`}>Documents to prepare</h2>
      {query.isLoading && (
        <div aria-busy="true">
          <p role="status" className="sr-only">Loading documents…</p>
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="mt-2 h-14 w-full rounded-xl" />
        </div>
      )}
      {query.isError && (
        <div role="alert">
          <p className="mb-2 text-body text-danger">Couldn&apos;t load the documents list.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>Retry</Button>
        </div>
      )}
      {query.data && <DocumentList documents={query.data.documents} heldKinds={heldKinds} />}
    </section>
  )
}

/** The page's loading shape: heading block, the facts card, the documents rows. */
export function DetailSkeleton() {
  return (
    <div aria-busy="true" className="px-4 py-4">
      <p role="status" className="sr-only">Loading service…</p>
      <div className="flex items-start gap-3">
        <Skeleton className="size-6 shrink-0 rounded-md" />
        <div className="flex-1">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="mt-2 h-4 w-full" />
        </div>
      </div>
      <Skeleton className="mt-5 h-40 w-full rounded-xl" />
      <Skeleton className="mt-6 h-5 w-44" />
      <Skeleton className="mt-3 h-14 w-full rounded-xl" />
      <Skeleton className="mt-2 h-14 w-full rounded-xl" />
    </div>
  )
}

export function DetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="px-4 py-4">
      <div className="rounded-[14px] border border-line bg-surface p-5">
        <h2 className="font-display text-[1.375rem] font-semibold text-ink">Couldn&apos;t load this service.</h2>
        <p className="mt-2 text-body text-ink">Check your connection and try again.</p>
        <Button type="button" size="lg" className="mt-4" onClick={onRetry}>Retry</Button>
      </div>
    </div>
  )
}
