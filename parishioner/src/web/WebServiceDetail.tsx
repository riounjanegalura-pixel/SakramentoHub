import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { fetchServices } from '../lib/data/services'
import { fetchRequirements } from '../lib/data/requirements'
import { fetchWallet } from '../lib/data/wallet'
import { useBookingStore } from '../stores/booking-store'
import { wizardFor } from '../features/booking/wizard/registry'
import { feeText, leadLabel } from '../features/services/serviceText'
import { DetailError, DetailSkeleton, DocumentsSection, PrepareList, ServiceFacts } from '../features/services/ServiceDetailParts'
import { ServiceIcon } from '../components/shared/ServiceIcon'
import { EmergencyCallRow } from '../components/shared/EmergencyCallRow'
import { Button } from '../components/ui/button'
import { WebFrame } from './WebFrame'

export function WebServiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const startBooking = useBookingStore((s) => s.startBooking)
  const services = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const service = services.data?.find((s) => s.id === id)
  const requirements = useQuery({ queryKey: ['requirements', id], queryFn: () => fetchRequirements(id!), enabled: !!service })
  // The wallet only adds ticks: if it cannot be read the page still works without them.
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: fetchWallet, retry: false, enabled: !!service })

  if (services.isLoading) return <WebFrame width="max-w-6xl"><DetailSkeleton /></WebFrame>
  if (services.isError) return <WebFrame width="max-w-6xl"><DetailError onRetry={() => void services.refetch()} /></WebFrame>
  if (!service) return <Navigate to="/services" replace />

  const heldKinds = new Set((wallet.data ?? []).map((d) => d.kind as string))
  const prepare = wizardFor(service.id)?.prepare ?? []

  function start() {
    startBooking(service!.id as Parameters<typeof startBooking>[0])
    navigate(`/booking/${service!.id}/1`)
  }

  return (
    <WebFrame width="max-w-6xl">
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div>
          <Link to="/services" className="mb-3 inline-flex min-h-10 items-center text-body font-semibold text-navy underline underline-offset-4">← All services</Link>
          {(service.sacrament === 'funeral' || service.sacrament === 'anointing') && <EmergencyCallRow className="mb-5" />}
          <div className="mb-5 flex items-start gap-3">
            <ServiceIcon sacrament={service.sacrament} />
            <div className="min-w-0">
              <h1 className="[overflow-wrap:anywhere] font-display text-title font-semibold text-navy">{service.name}</h1>
              <p className="mt-1 text-body text-ink-muted">{service.description}</p>
            </div>
          </div>

          <div className="mb-6">
            <ServiceFacts service={service} />
          </div>

          <DocumentsSection query={requirements} heldKinds={heldKinds} headingClass="text-heading" />

          {prepare.length > 0 && (
            <section aria-labelledby="prepare-heading" className="mb-6">
              <h2 id="prepare-heading" className="mb-2 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">Also prepare</h2>
              <PrepareList items={prepare} />
            </section>
          )}
        </div>

        <aside aria-label="Book this service" className="sticky top-24 h-fit rounded-[14px] border border-line bg-surface p-5">
          <h2 className="mb-3 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">Book this service</h2>
          <p className="text-body font-semibold text-ink tabular-nums">{feeText(service)}</p>
          <p className="mb-4 text-body text-ink-muted">{leadLabel(service)}</p>
          <Button type="button" size="lg" className="mt-2 w-full" onClick={start}>
            Start booking
          </Button>
        </aside>
      </div>
    </WebFrame>
  )
}
