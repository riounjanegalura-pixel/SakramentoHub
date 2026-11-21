import { useQuery } from '@tanstack/react-query'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { EmergencyCallRow } from '../../components/shared/EmergencyCallRow'
import { Emblem } from '../../components/shared/Emblem'
import { Button } from '../../components/ui/button'
import { WhatToBring } from './WhatToBring'
import { fetchServices } from '../../lib/data/services'
import { fetchRequirements } from '../../lib/data/requirements'
import { fetchWallet } from '../../lib/data/wallet'
import { useBookingStore } from '../../stores/booking-store'
import { wizardFor } from '../booking/wizard/registry'
import { DetailError, DetailSkeleton, DocumentsSection, PrepareList, ServiceFacts } from './ServiceDetailParts'

/** Funeral and Anointing: the page opens with the way to call the parish now. */
const URGENT = new Set<string>(['funeral', 'anointing'])

export function ServiceDetailScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const startBooking = useBookingStore((s) => s.startBooking)
  const services = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const service = services.data?.find((s) => s.id === id)
  const requirements = useQuery({ queryKey: ['requirements', id], queryFn: () => fetchRequirements(id!), enabled: !!service })
  // The wallet only adds ticks: if it cannot be read the page still works without them.
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: fetchWallet, retry: false, enabled: !!service })
  const header = <AppHeader title="Service" onBack={() => navigate('/services')} />

  if (services.isLoading) return <AppShell header={header} showBottomNav={false}><DetailSkeleton /></AppShell>
  if (services.isError) return <AppShell header={header} showBottomNav={false}><DetailError onRetry={() => void services.refetch()} /></AppShell>
  if (!service) return <Navigate to="/services" replace />

  const heldKinds = new Set((wallet.data ?? []).map((d) => d.kind as string))
  const prepare = wizardFor(service.id)?.prepare ?? []

  function start() {
    startBooking(service!.id as Parameters<typeof startBooking>[0])
    navigate(`/booking/${service!.id}/1`)
  }

  // The footer goes through the shell's floating slot: inside the animated main its fixed position would
  // be relative to the entry transform and the bar would slide in with the page.
  const footer = (
    <div
      data-slot="service-footer"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-[480px] gap-3 border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <WhatToBring serviceId={service.id} serviceName={service.name} prepare={prepare} />
      <Button type="button" size="lg" className="flex-1" onClick={start}>
        Start booking
      </Button>
    </div>
  )

  return (
    <AppShell header={header} showBottomNav={false} floating={footer}>
      <div className="px-4 py-4 pb-32">
        {URGENT.has(service.sacrament) && <EmergencyCallRow className="mb-5" />}
        <div data-slot="service-hero" className="-mx-4 -mt-4 mb-5 flex h-[204px] items-end justify-center overflow-hidden border-b-[3px] border-gold bg-paper-deep px-5 pt-6">
          <Emblem kind={service.sacrament} size="lg" className="border-b-0" />
        </div>
        <div className="mb-5">
          <h1 className="font-display text-display-xl font-semibold text-navy [overflow-wrap:anywhere]">{service.name}</h1>
          <p className="mt-2 text-body text-ink-muted">{service.description}</p>
        </div>

        <div className="mb-6">
          <ServiceFacts service={service} />
        </div>

        <DocumentsSection query={requirements} heldKinds={heldKinds} />

        {prepare.length > 0 && (
          <section aria-labelledby="prepare-heading" className="mb-6">
            <h2 id="prepare-heading" className="mb-2 border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">Also prepare</h2>
            <PrepareList items={prepare} />
          </section>
        )}
      </div>
    </AppShell>
  )
}
