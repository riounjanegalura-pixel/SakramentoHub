import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import * as m from 'motion/react-m'
import { fadeUp, staggerDelay } from '../../lib/motion'
import { UnderlineTabs } from '../../components/shared/UnderlineTabs'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { LoadError } from '../../components/shared/LoadError'
import { Skeleton } from '../../components/shared/Skeleton'
import { fetchSettings } from '../../lib/data/settings'
import { useAuthStore } from '../../stores/auth-store'
import { Reveal } from '../../components/shared/Reveal'
import { ADMIN_ONLY_NOTE } from './Field'
import { BlackoutsCard } from './BlackoutsCard'
import { ParishCard } from './ParishCard'
import { ServiceCard } from './ServiceCard'

const TABS = ['parish', 'services', 'policy', 'blackouts'] as const
type Tab = (typeof TABS)[number]

const CARD = 'rounded-2xl border border-line bg-surface p-5 md:p-6'

/**
 * Parish rules, service rules and closed dates (spec §7). Staff can read all of it
 * and manage blackout dates; only the administrator can save parish and service rules.
 */
export function SettingsScreen() {
  const canEdit = useAuthStore((s) => s.user?.role) === 'admin'
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(requested ?? '') ? (requested as Tab) : 'parish'
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['admin-settings'], queryFn: fetchSettings })

  return (
    <AdminLayout title="Settings">
      <div className="flex w-full max-w-[1760px] flex-col gap-4">
      {isLoading && (
        <div aria-busy="true" className="flex flex-col gap-6">
          <p role="status" className="sr-only">
            Loading settings
          </p>
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      )}
      {isError && <LoadError title="Settings didn't load" message="Check your connection, then try again." detail={(error as Error).message} onRetry={() => void refetch()} />}

      {data && (
        <>
        {!canEdit && tab !== 'blackouts' && tab !== 'policy' && (
          <p role="note" className="flex items-center gap-2.5 rounded-xl border border-line bg-paper-deep px-4 py-3 text-[14px] text-ink">
            <Lock size={18} aria-hidden="true" className="shrink-0 text-navy" />
            {ADMIN_ONLY_NOTE}
          </p>
        )}
        <div>
          {/* The tabs: words on a hairline with a sliding underline. Panels stay mounted (hidden when inactive) so unsaved edits and the blackout result survive a tab switch. */}
          {/* Pinned under the page header on desktop so the sections stay one click away while scrolling. */}
          <div className="z-10 bg-paper md:sticky md:top-[66px]">
            <UnderlineTabs
              label="Settings sections"
              value={tab}
              onChange={(v) => setParams({ tab: v }, { replace: true })}
              tabs={[
                { value: 'parish', label: 'Parish' },
                { value: 'services', label: 'Services' },
                { value: 'policy', label: 'Policy' },
                { value: 'blackouts', label: 'Blackout dates' },
              ]}
            />
          </div>
          <div role="tabpanel" hidden={tab !== "parish"} className="pt-4">
            <Reveal><ParishCard parish={data.parish} canEdit={canEdit} /></Reveal>
          </div>
          <div role="tabpanel" hidden={tab !== "services"} className="pt-4">
            <section aria-label="Services" className="flex flex-col gap-4">
              <h2 className="font-display text-heading font-semibold text-navy">Services</h2>
              {data.services.length === 0 && <p className="text-sm text-ink-muted">No services are set up yet.</p>}
              {data.services.map((s, i) => (
                <ServiceCard key={s.id} service={s} canEdit={canEdit} defaultOpen={i === 0} />
              ))}
            </section>
          </div>
          <div role="tabpanel" hidden={tab !== "policy"} className="pt-4">
            <section aria-label="Policy" className="flex flex-col gap-4">
              <p className="max-w-[640px] text-[14px] text-ink-muted">The system sets these for everyone. There is nothing to save here.</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                  { n: data.policy.paymentHoldHours, unit: 'hours', label: 'Payment hold', text: 'An unpaid booking, by GCash or cash at the parish office, keeps its slot for this long.' },
                  { n: data.policy.returnedHoldDays, unit: 'days', label: 'Returned for changes', text: 'A booking sent back for changes keeps its slot for this long.' },
                  { n: data.policy.changeCutoffDays, unit: 'days', label: 'Change or cancel online', text: 'An approved booking can be changed or cancelled online until this long before the appointment.' },
                ].map((p, i) => (
                  <m.div key={p.label} variants={fadeUp} initial="initial" animate={{ ...fadeUp.animate, transition: { ...(fadeUp.animate as { transition: object }).transition, delay: staggerDelay(i) } }} className={CARD}>
                    <p className="flex items-baseline gap-2">
                      <span className="font-display text-[40px] font-semibold leading-none tabular-nums text-navy">{p.n}</span>{' '}
                      <span className="text-[15px] text-ink-muted">{p.unit}</span>
                    </p>
                    <h2 className="mt-2 text-[16px] font-semibold text-ink">{p.label}</h2>
                    <p className="mt-1 text-[14px] leading-normal text-ink-muted">{p.text}</p>
                  </m.div>
                ))}
              </div>
            </section>
          </div>
          <div role="tabpanel" hidden={tab !== "blackouts"} className="pt-4">
            <BlackoutsCard services={data.services} triduum={data.triduum} />
          </div>
        </div>
        </>
      )}
      </div>
    </AdminLayout>
  )
}
