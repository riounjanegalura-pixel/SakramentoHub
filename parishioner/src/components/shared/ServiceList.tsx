import type { ReactNode } from 'react'
import type { Service } from '../../lib/types'
import { feeText, hasFee, leadLabel } from '../../features/services/serviceText'
import { EmblemTile } from './EmblemTile'
import { ServiceRow } from './ServiceRow'

/** Funeral and Anointing of the Sick are urgent and grief-bound: they sit first, apart, and never show a fee. */
const URGENT = new Set<string>(['funeral', 'anointing'])

/**
 * The sacrament list. The urgent two come first in their own bordered block, under the way to call the parish
 * (`emergency`); the planned sacraments follow as emblem tiles, two to a row, under a register rule.
 */
export function ServiceList({ services, emergency }: { services: Service[]; emergency?: ReactNode }) {
  const planned = services.filter((s) => !URGENT.has(s.sacrament))
  const urgent = services.filter((s) => URGENT.has(s.sacrament))
  return (
    <div className="flex flex-col gap-7">
      {(urgent.length > 0 || emergency) && (
        <section aria-labelledby="urgent-heading" className="flex flex-col gap-4 rounded-2xl border-2 border-navy bg-surface p-5">
          <h2 id="urgent-heading" className="sr-only">When it is urgent</h2>
          {emergency}
          {urgent.length > 0 && (
            <ul aria-label="Urgent sacraments" className="divide-y divide-line">
              {urgent.map((service) => (
                <li key={service.id}>
                  <ServiceRow service={service} showFee={false} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {planned.length > 0 && (
        <section aria-labelledby="plan-heading" className="flex flex-col gap-3.5">
          <h2 id="plan-heading" className="border-t-2 border-navy pt-3 font-display text-[1.375rem] leading-[1.3] font-semibold text-ink">
            Plan a sacrament
          </h2>
          <ul aria-label="Sacraments" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            {planned.map((service) => (
              <li key={service.id}>
                <EmblemTile
                  to={`/services/${service.id}`}
                  kind={service.sacrament}
                  name={service.name}
                  caption={leadLabel(service)}
                  note={hasFee(service) ? `Fee: ${feeText(service)}` : undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
