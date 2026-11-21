import { useId, useState, type ReactNode } from 'react'
import * as m from 'motion/react-m'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { Skeleton, TableSkeleton } from '../../components/shared/Skeleton'
import { DataTable, createDataTableColumns } from '../../components/shared/DataTable'
import { LoadError } from '../../components/shared/LoadError'
import { nativeSelectClass } from '../../components/shared/formStyles'
import { Button } from '@/components/ui/button'
import { SACRAMENT_LABEL } from '../../lib/constants'
import { monthBounds, shiftMonth } from '../../lib/dates'
import { appointmentText, PAYMENT_LABEL, parishToday, peso, STATUS_LABEL } from '../../lib/domain'
import { csvFileName, downloadBookingsCsv, downloadBookingsXlsx, fetchAllBookings, fetchReportSummary, xlsxFileName } from '../../lib/data/reports'
import { durations, ease, staggerDelay } from '../../lib/motion'
import { saveBlob } from '../../lib/download'
import type { AdminBooking, ReportQuery, Sacrament } from '../../lib/types'
import { ReportCharts } from './ReportCharts'
import { changeText, summaryRows, toCsv } from './reportsModel'

const SACRAMENT_OPTIONS = Object.keys(SACRAMENT_LABEL) as Sacrament[]
const DAY_MS = 86_400_000

function rangeError(from: string, to: string): string | null {
  if (!from || !to) return 'Choose both dates.'
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  if (days < 0) return 'The end date must not be before the start date.'
  if (days > 366) return 'A report may cover at most one year.'
  return null
}

function Stat({ label, value, change }: { label: string; value: string | number; change?: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1.5 rounded-xl border border-line bg-paper px-3.5 py-3">
      <dt className="text-label text-ink-muted">{label}</dt>
      <dd className="font-display text-[1.75rem] font-semibold leading-none tabular-nums text-navy">{value}</dd>
      {change && <dd className="text-[12px] leading-snug text-ink-muted">{change}</dd>}
    </div>
  )
}

function Panel({ title, note, index, children }: { title: string; note?: string; index: number; children: ReactNode }) {
  return (
    <m.section
      aria-label={title}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: durations.base, ease: [...ease], delay: staggerDelay(index) }}
      className="flex h-full flex-col rounded-2xl border border-line bg-surface p-4 sm:p-5"
    >
      <h2 className="font-display text-[18px] font-semibold text-navy">{title}</h2>
      {note && <p className="mt-0.5 text-[13px] text-ink-muted">{note}</p>}
      <div className="mt-3 flex-1 [&>dl]:h-full [&>dl]:auto-rows-fr">{children}</div>
    </m.section>
  )
}

/** "Up 3 (60%) on the period before", or nothing when the server sent no earlier period. */
function vs(now: number, before: number | undefined): string | undefined {
  return before === undefined ? undefined : `${changeText(now, before)} on the period before`
}

const registerColumns = createDataTableColumns<AdminBooking>((col) => [
  col.accessor('referenceNumber', {
    header: 'Reference',
    cell: ({ row: { original: b } }) => (
      <Link to={`/bookings/${b.id}`} className="inline-flex min-h-11 items-center font-mono text-label text-navy underline lg:min-h-8">{b.referenceNumber}</Link>
    ),
  }),
  col.accessor('subjectName', { header: 'For', cell: ({ row: { original: b } }) => <span className="text-ink">{b.subjectName}</span> }),
  col.accessor((b) => b.user.fullName, {
    id: 'contact',
    header: 'Contact',
    cell: ({ row: { original: b } }) => (
      <>
        <span className="block text-ink">{b.user.fullName}</span>
        {b.user.phone && <span className="block text-label text-ink-muted">{b.user.phone}</span>}
      </>
    ),
  }),
  col.accessor((b) => (b.appointmentDate && b.appointmentStart ? `${b.appointmentDate} ${b.appointmentStart}` : null), {
    id: 'appointment',
    header: 'Appointment',
    cell: ({ row: { original: b } }) => <span className="text-ink">{appointmentText(b)}</span>,
  }),
  col.accessor('status', { header: 'Status', cell: ({ row: { original: b } }) => STATUS_LABEL[b.status] }),
  col.accessor((b) => (b.paymentStatus ? PAYMENT_LABEL[b.paymentStatus] : null), {
    id: 'payment',
    header: 'Payment',
    cell: ({ row: { original: b } }) => (b.paymentStatus ? PAYMENT_LABEL[b.paymentStatus] : '—'),
  }),
  col.accessor('channel', { header: 'Channel', cell: ({ row: { original: b } }) => (b.channel === 'walk_in' ? 'Walk-in' : 'Online') }),
])

/**
 * The parish priest's report (spec §8): summary, charts, register list, and Excel or CSV exports.
 * The CSV holds personal data, so it is fetched through the authenticated client
 * (never a plain link) and the server audits every export.
 */
export function ReportsScreen() {
  const today = parishToday() // the last twelve months, so the monthly charts have something to compare
  const [from, setFrom] = useState(monthBounds(shiftMonth(today, -11)).start)
  const [to, setTo] = useState(monthBounds(today).end)
  const [sacrament, setSacrament] = useState<Sacrament | ''>('')

  const error = rangeError(from, to)
  const query: ReportQuery = { from, to, sacrament }
  const enabled = error === null

  const summary = useQuery({ queryKey: ['admin-report-summary', from, to, sacrament], queryFn: () => fetchReportSummary(query), enabled })
  const register = useQuery({ queryKey: ['admin-report-register', from, to, sacrament], queryFn: () => fetchAllBookings({ from, to, sacrament }), enabled })

  const exportCsv = useMutation({
    mutationFn: async () => saveBlob(await downloadBookingsCsv(query), csvFileName(query)),
  })
  const exportXlsx = useMutation({
    mutationFn: async () => saveBlob(await downloadBookingsXlsx(query), xlsxFileName(query)),
  })

  const s = summary.data
  const errorId = useId()
  const rangeProps = error ? { 'aria-invalid': true as const, 'aria-describedby': errorId } : {}
  const fieldClass = `${nativeSelectClass} w-auto font-normal`

  return (
    <AdminLayout title="Reports">
      <div className="flex w-full max-w-[1760px] flex-col gap-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClass} {...rangeProps} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass} {...rangeProps} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Sacrament
            <select value={sacrament} onChange={(e) => setSacrament(e.target.value as Sacrament | '')} className={fieldClass}>
              <option value="">All sacraments</option>
              {SACRAMENT_OPTIONS.map((id) => <option key={id} value={id}>{SACRAMENT_LABEL[id]}</option>)}
            </select>
          </label>
          <div className="flex gap-2 sm:ml-auto">
            <Button type="button" disabled={!enabled || exportXlsx.isPending} onClick={() => exportXlsx.mutate()}>
              <Download size={16} aria-hidden="true" /> Export Excel
            </Button>
            <Button type="button" variant="outline" disabled={!enabled || exportCsv.isPending} onClick={() => exportCsv.mutate()}>
              <Download size={16} aria-hidden="true" /> Export CSV
            </Button>
            <Button type="button" variant="outline" disabled={!s} onClick={() => s && saveBlob(toCsv(['Section', 'Measure', 'Value'], summaryRows(s)), `report-summary-${from}-to-${to}.csv`)}>
              <Download size={16} aria-hidden="true" /> Summary CSV
            </Button>
          </div>
        </div>

        {error && <p id={errorId} role="alert" className="text-sm font-medium text-danger">{error}</p>}
        {exportCsv.isError && <p role="alert" className="text-sm font-medium text-danger">{(exportCsv.error as Error).message}</p>}
        {exportXlsx.isError && <p role="alert" className="text-sm font-medium text-danger">{(exportXlsx.error as Error).message}</p>}
        {summary.isError && (
          <LoadError message={`Couldn’t load the report: ${(summary.error as Error).message}`} onRetry={() => void summary.refetch()} />
        )}

        {enabled && summary.isLoading && (
          <div aria-busy="true" className="flex flex-col gap-4">
            <p role="status" className="sr-only">Loading the report</p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Skeleton className="h-40 w-full rounded-2xl lg:col-span-2" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
              <Skeleton className="h-80 w-full rounded-2xl lg:col-span-4" />
              <Skeleton className="h-80 w-full rounded-2xl lg:col-span-2" />
            </div>
          </div>
        )}

        {s && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Panel title="Summary" index={0}>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Bookings" value={s.totals.bookings} change={vs(s.totals.bookings, s.previous?.bookings)} />
                  <Stat label="Completed" value={s.totals.completed} change={vs(s.totals.completed, s.previous?.completed)} />
                  <Stat label="Certificates issued" value={s.certificates?.issued ?? 0} change={vs(s.certificates?.issued ?? 0, s.previous?.certificatesIssued)} />
                  <Stat label="Declined" value={s.totals.declined} />
                  <Stat label="Cancelled" value={s.totals.cancelled} />
                  <Stat label="Online" value={s.totals.online} />
                  <Stat label="Walk-in" value={s.totals.walkIn} />
                  <Stat label="Urgent" value={s.totals.urgent} />
                </dl>
              </Panel>
            </div>
            <Panel
              title="Money"
              index={1}
              note="Collected and refunded are counted by the day they happened in this range. Refunds still due and overpayments are today’s totals."
            >
              <dl className="grid grid-cols-2 gap-3">
                <Stat label="Fees collected" value={peso(s.money.collectedCentavos)} />
                <Stat label="Refunded in this range" value={peso(s.money.refundedCentavos)} />
                <Stat label="Refunds still due" value={peso(s.money.refundDueCentavos)} />
                <Stat label="Overpaid, to refund" value={peso(s.money.overpaidCentavos)} />
                <Stat label="Gifts received" value={peso(s.donations?.totalCentavos ?? 0)} change={vs(s.donations?.totalCentavos ?? 0, s.previous?.donationsCentavos)} />
              </dl>
            </Panel>
          </div>
        )}

        {s && <ReportCharts s={s} sacrament={sacrament} />}

        <section aria-label="Register" className="flex flex-col gap-2">
          <h2 className="font-display text-[18px] font-semibold text-navy">Register</h2>
          {enabled && register.isLoading && (
            <div aria-busy="true" className="overflow-hidden rounded-2xl border border-line bg-surface">
              <p role="status" className="sr-only">Loading the register</p>
              <TableSkeleton rows={6} columns={6} />
            </div>
          )}
          {register.isError && (
            <LoadError message={`Couldn’t load the register: ${(register.error as Error).message}`} onRetry={() => void register.refetch()} />
          )}
          {register.data && (
            <>
              <DataTable
                caption="Bookings register"
                columns={registerColumns}
                data={register.data.rows}
                pageSize={10}
                getRowId={(b) => b.id}
                emptyState="No bookings in this range."
              />
              {register.data.truncated && (
                <p className="text-sm text-status-pending-fg">
                  Showing the first {register.data.rows.length} of {register.data.total}. Export the CSV for the full list.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </AdminLayout>
  )
}
