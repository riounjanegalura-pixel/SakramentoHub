import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { SACRAMENT_LABEL } from '../../lib/constants'
import { peso } from '../../lib/domain'
import type { ReportSummary, Sacrament } from '../../lib/types'
import { AXIS, ChartCard, ChartTooltip, ColumnChart, type Point } from './ChartCard'
import { monthName, STATUS_BARS, statusTotals, WEEKDAYS } from './reportsModel'

/** Pesos on an axis: whole pesos, no centavos. */
const pesoAxis = (centavos: number) => `₱${Math.round(centavos / 100).toLocaleString('en-PH')}`

function SacramentStatusChart({ s }: { s: ReportSummary }) {
  const rows = s.bySacrament.map((r) => {
    const row: Record<string, string | number> = { name: r.name }
    for (const bar of STATUS_BARS) row[bar.id] = bar.statuses.reduce((n, st) => n + (r.byStatus[st] ?? 0), 0)
    return row
  })
  const totals = statusTotals(s)
  const height = Math.max(160, rows.length * 40 + 24)
  return (
    <div>
      <div role="img" aria-label={`Bookings by sacrament and status, ${s.totals.bookings} in total.`} style={{ height }} className="w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 420, height }}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke="var(--line)" />
            <XAxis type="number" {...AXIS} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" {...AXIS} width={104} />
            <Tooltip cursor={{ fill: 'var(--paper-deep)', opacity: 0.6 }} content={<ChartTooltip />} />
            {STATUS_BARS.map((b, i) => (
              <Bar
                key={b.id}
                dataKey={b.id}
                name={b.label}
                stackId="status"
                fill={b.colour}
                stroke="var(--surface)"
                strokeWidth={2}
                radius={i === STATUS_BARS.length - 1 ? [0, 4, 4, 0] : 0}
                maxBarSize={22}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul aria-label="Statuses" className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] text-ink">
        {totals.map((t) => (
          <li key={t.id} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-[3px]" style={{ backgroundColor: t.colour }} />
            <span className="text-ink-muted">{t.label}</span>
            <span className="ml-auto font-semibold tabular-nums">{t.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Every chart of the report, in a bento grid. Each has a Table view with the same figures and a CSV download. */
export function ReportCharts({ s, sacrament }: { s: ReportSummary; sacrament: Sacrament | '' }) {
  const monthly = s.monthly ?? []
  const stamp = `${s.range.from}-to-${s.range.to}`
  const emptyBookings = s.totals.bookings === 0 ? 'No bookings in this range.' : undefined
  const weekday = s.byWeekday ?? []
  const certs = s.certificates?.issued ?? 0
  const gifts = s.donations?.totalCentavos ?? 0
  const point = (mo: (typeof monthly)[number], value: number): Point => ({ key: mo.month, label: monthName(mo.month), short: monthName(mo.month, true), value })

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-6 print:grid-cols-2">
      <ChartCard
        index={0}
        className="lg:col-span-4"
        title="Bookings per month"
        note={`${sacrament ? `${SACRAMENT_LABEL[sacrament]} only. ` : ''}Bands behind the bars show the liturgical season.`}
        fileName={`bookings-per-month-${stamp}.csv`}
        empty={emptyBookings}
        table={{
          header: ['Month', 'Bookings', ...STATUS_BARS.map((x) => x.label)],
          rows: monthly.map((mo) => [monthName(mo.month), mo.bookings, ...STATUS_BARS.map((x) => x.statuses.reduce((n, st) => n + (mo.byStatus[st] ?? 0), 0))]),
        }}
      >
        <ColumnChart name="Bookings" points={monthly.map((mo) => point(mo, mo.bookings))} seasons label={`Bookings per month, ${s.totals.bookings} in total.`} height={260} />
      </ChartCard>

      <ChartCard
        index={1}
        className="lg:col-span-2"
        title="By sacrament and status"
        note="Cancelled bookings are not charted."
        fileName={`bookings-by-sacrament-${stamp}.csv`}
        empty={emptyBookings}
        table={{
          header: ['Sacrament', 'Bookings', ...STATUS_BARS.map((x) => x.label)],
          rows: s.bySacrament.map((r) => [r.name, r.total, ...STATUS_BARS.map((x) => x.statuses.reduce((n, st) => n + (r.byStatus[st] ?? 0), 0))]),
        }}
      >
        <SacramentStatusChart s={s} />
      </ChartCard>

      <ChartCard
        index={2}
        className="lg:col-span-2"
        title="Bookings by weekday"
        fileName={`bookings-by-weekday-${stamp}.csv`}
        empty={emptyBookings}
        table={{ header: ['Weekday', 'Bookings'], rows: WEEKDAYS.map((d, i) => [d, weekday[i] ?? 0]) }}
      >
        <ColumnChart
          name="Bookings"
          label="Bookings by weekday"
          height={200}
          points={WEEKDAYS.map((d, i) => ({ key: d, label: d, short: d.slice(0, 3), value: weekday[i] ?? 0 }))}
        />
      </ChartCard>

      <ChartCard
        index={3}
        className="lg:col-span-2"
        title="Certificates issued"
        fileName={`certificates-issued-${stamp}.csv`}
        empty={certs === 0 ? 'No certificates were issued in this range.' : undefined}
        table={{ header: ['Month', 'Certificates issued'], rows: monthly.map((mo) => [monthName(mo.month), mo.certificatesIssued]) }}
      >
        <ColumnChart name="Certificates" points={monthly.map((mo) => point(mo, mo.certificatesIssued))} label={`Certificates issued per month, ${certs} in total.`} height={200} />
      </ChartCard>

      <ChartCard
        index={4}
        className="lg:col-span-2"
        title="Donations per month"
        note="Gifts paid through GCash. Booking fees are under Money."
        fileName={`donations-per-month-${stamp}.csv`}
        empty={(s.donations?.count ?? 0) === 0 ? 'No gifts were paid in this range.' : undefined}
        table={{ header: ['Month', 'Gifts (PHP)'], rows: monthly.map((mo) => [monthName(mo.month), (mo.donationsCentavos / 100).toFixed(2)]) }}
      >
        <ColumnChart
          name="Gifts"
          points={monthly.map((mo) => point(mo, mo.donationsCentavos))}
          label={`Gifts per month, ${peso(gifts)} in total.`}
          height={200}
          format={peso}
          axisFormat={pesoAxis}
        />
      </ChartCard>
    </div>
  )
}
