import { useQuery } from '@tanstack/react-query'
import { fetchServices } from '../lib/data/services'
import { ServiceCatalog } from '../features/services/ServiceCatalog'
import { WebFrame } from './WebFrame'

export function WebServices() {
  const { data: services, isLoading, isError, refetch } = useQuery({ queryKey: ['services'], queryFn: fetchServices })

  return (
    <WebFrame width="max-w-3xl">
      <h1 className="mb-1 font-display text-title font-semibold text-navy">Book a sacrament</h1>
      <p className="mb-6 text-body text-ink-muted">Choose a sacrament to see what to prepare, then start your booking.</p>
      <ServiceCatalog services={services} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} />
    </WebFrame>
  )
}
