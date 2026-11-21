import { useQuery } from '@tanstack/react-query'
import { fetchAuditSummary } from '../../lib/data/audit-log'
import { Avatar } from './Avatar'

const shortDay = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** The side panel: a bar for each of the last 14 days, and the people who did the most in that time. */
export function ActivityRail() {
  const { data } = useQuery({ queryKey: ['admin-audit-summary'], queryFn: fetchAuditSummary })
  if (!data) return null
  const max = Math.max(1, ...data.days.map((d) => d.count))
  const first = data.days[0]?.date
  const last = data.days[data.days.length - 1]?.date
  const busiest = data.days.reduce((a, b) => (b.count > a.count ? b : a), data.days[0])

  return (
    <aside aria-label="Activity" className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[18px] font-semibold text-navy">Last 14 days</h2>
          <p className="text-[14px] tabular-nums text-ink-muted">{data.total.toLocaleString('en-PH')} actions</p>
        </div>
        <div
          role="img"
          aria-label={`Actions per day, ${first ? shortDay(first) : ''} to ${last ? shortDay(last) : ''}. ${data.total} in total${busiest && busiest.count > 0 ? `, most on ${shortDay(busiest.date)} with ${busiest.count}` : ''}.`}
          className="flex h-24 items-end gap-1"
        >
          {data.days.map((d) => (
            <span
              key={d.date}
              aria-hidden="true"
              style={{ height: `${Math.max(4, Math.round((d.count / max) * 96))}px` }}
              className={`flex-1 rounded-t ${d === busiest && d.count > 0 ? 'bg-navy' : 'bg-status-confirmed-fg/35'}`}
            />
          ))}
        </div>
        <div aria-hidden="true" className="mt-2 flex justify-between text-[13px] text-ink-muted">
          <span>{first ? shortDay(first) : ''}</span>
          <span>{last ? shortDay(last) : ''}</span>
        </div>
      </section>

      {data.people.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-3 font-display text-[18px] font-semibold text-navy">Who</h2>
          <ul className="flex flex-col gap-3">
            {data.people.map((p) => (
              <li key={p.name} className="flex items-center gap-3">
                <Avatar name={p.name} size={30} />
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{p.name}</span>
                <span className="text-[14px] font-medium tabular-nums text-ink-muted">{p.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}
