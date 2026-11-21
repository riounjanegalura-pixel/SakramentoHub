import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Emblem } from '../../components/shared/Emblem'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import { EmergencyCallRow } from '../../components/shared/EmergencyCallRow'
import { ServiceList } from '../../components/shared/ServiceList'
import { SACRAMENT_LABEL } from '../../lib/domain'
import type { Service } from '../../lib/types'
import { useBookingStore } from '../../stores/booking-store'

function RowSkeleton() {
  return (
    <div className="flex min-h-16 items-center gap-3 px-1 py-3">
      <Skeleton className="size-6 shrink-0 rounded-md" />
      <div className="flex-1">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="mt-2 h-4 w-2/3" />
      </div>
    </div>
  )
}

/** The loading shape matches the loaded one: ruled rows. */
function ServicesSkeleton() {
  return (
    <div aria-busy="true" className="divide-y divide-line border-y border-line">
      <p role="status" className="sr-only">Loading services…</p>
      {[0, 1, 2, 3, 4].map((i) => <RowSkeleton key={i} />)}
    </div>
  )
}

function ServicesEmpty() {
  return (
    <div className="rounded-2xl border border-line bg-paper-deep p-5">
      <h2 className="font-display text-[1.375rem] font-semibold text-ink">No services are open for booking right now.</h2>
      <p className="mt-2 text-body text-ink">Please check back soon, or contact the parish office if you need help sooner.</p>
    </div>
  )
}

function ServicesError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-line bg-paper-deep p-5">
      <h2 className="font-display text-[1.375rem] font-semibold text-ink">Couldn&apos;t load services.</h2>
      <p className="mt-2 text-body text-ink">Check your connection and try again.</p>
      <Button type="button" size="lg" className="mt-4" onClick={onRetry}>Retry</Button>
    </div>
  )
}

/** A booking started and left: ask before anything else, so the list never silently resumes or discards it. */
function DraftRow() {
  const sacrament = useBookingStore((s) => s.sacrament)
  const started = useBookingStore((s) => Object.keys(s.formData).length > 0 || s.bookingId !== null)
  if (!sacrament || !started) return null
  const label = SACRAMENT_LABEL[sacrament]
  return (
    <Link
      to={`/booking/${sacrament}/1`}
      className="flex min-h-[72px] items-center gap-3 rounded-2xl border-2 border-navy bg-surface p-4 text-ink hover:bg-paper-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold">Continue your {label} booking</span>
        <span className="block text-note text-ink-muted">Your answers are kept. Or choose another sacrament below.</span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-ink-muted" aria-hidden="true" />
    </Link>
  )
}

interface ServiceCatalogProps {
  services: Service[] | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

/** The Book body for phone and desktop: urgent help, a draft to continue, the four states, the list, the certificate-copy entry. */
export function ServiceCatalog({ services, isLoading, isError, onRetry }: ServiceCatalogProps) {
  return (
    <div className="flex flex-col gap-7">
      <DraftRow />
      {isLoading && <ServicesSkeleton />}
      {isError && <ServicesError onRetry={onRetry} />}
      {!isLoading && !isError && services?.length === 0 && <ServicesEmpty />}
      {services && services.length > 0 ? (
        <ServiceList services={services} emergency={<EmergencyCallRow bare />} />
      ) : (
        <EmergencyCallRow />
      )}
      <section aria-labelledby="certificates-heading" className="flex flex-col gap-3.5">
        <h2 id="certificates-heading" className="border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">
          Certificates
        </h2>
        <Link
          to="/certificates/request"
          className="flex min-h-[88px] items-center gap-4 rounded-2xl border border-line bg-paper-deep p-4 text-ink hover:border-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Emblem kind="certificate" size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[1.25rem] leading-tight font-semibold text-navy">Request a certificate copy</span>
            <span className="block text-note text-ink-muted">A copy of a past baptism, confirmation, wedding or funeral record.</span>
          </span>
          <ChevronRight size={22} className="shrink-0 text-navy" aria-hidden="true" />
        </Link>
      </section>
    </div>
  )
}
