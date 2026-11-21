import { useQuery } from '@tanstack/react-query'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { fetchServices } from '../../lib/data/services'
import { ServiceCatalog } from './ServiceCatalog'

export function ServicesScreen() {
  const { data: services, isLoading, isError, refetch } = useQuery({
    queryKey: ['services'],
    queryFn: fetchServices,
  })

  return (
    <AppShell header={<AppHeader title="Book a sacrament" />}>
      <div className="px-5 py-4">
        <ServiceCatalog services={services} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} />
      </div>
    </AppShell>
  )
}
