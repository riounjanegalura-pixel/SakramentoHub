import { useId, useState, type ReactNode } from 'react'
import * as m from 'motion/react-m'
import { Download } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { saveBlob } from '../../lib/download'
import { cn } from '../../lib/utils'
import { durations, ease, staggerDelay } from '../../lib/motion'
import { SEASON_BAND, SEASON_LABEL, seasonOfMonth, toCsv, type Season } from './reportsModel'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

export interface TableData {
  header: string[]
  rows: (string | number)[][]
}

/** Shared look of every axis: quiet, in muted ink, no tick marks. */
export const AXIS = { tick: { fill: 'var(--ink-muted)', fontSize: 12 }, axisLine: { stroke: 'var(--line)' }, tickLine: false } as const

/**
 * A bento card around one chart. It fades in (index staggers neighbours), carries a Chart / Table switch and a CSV
 * download, and the Table view holds exactly the same figures so no number is available only through colour or hover.
 */
export function ChartCard({
  title,
  note,
  fileName,
  table,
  empty,
  index = 0,
  className,
  children,
}: {
  title: string
  note?: string
  fileName: string
  table: TableData
  /** Message shown instead of the chart when there is nothing to chart. */
  empty?: string
  index?: number
  className?: string
  children: ReactNode
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const id = useId()
  const tab = (v: 'chart' | 'table', label: string) => (
    <button
      type="button"
      aria-pressed={view === v}
      onClick={() => setView(v)}
      className={cn(
        'flex min-h-11 items-center rounded-lg px-3 text-[13px] lg:min-h-8',
        FOCUS,
        view === v ? 'bg-surface font-semibold text-navy shadow-[inset_0_0_0_2px_var(--navy)]' : 'font-medium text-ink-muted hover:text-navy',
      )}
    >
      {label}
    </button>
  )
  return (
    <m.section
      aria-labelledby={id}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: durations.base, ease: [...ease], delay: staggerDelay(index) }}
      className={cn('flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-4 sm:p-5 print:break-inside-avoid', className)}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 id={id} className="font-display text-[18px] font-semibold text-navy">{title}</h2>
          {note && <p className="mt-0.5 text-[13px] text-ink-muted">{note}</p>}
        </div>
        {!empty && (
          <div className="flex items-center gap-1.5 print:hidden">
            <div role="group" aria-label={`${title} view`} className="flex rounded-[10px] bg-paper-deep p-0.5">
              {tab('chart', 'Chart')}
              {tab('table', 'Table')}
            </div>
            <button
              type="button"
              aria-label={`Download ${title.toLowerCase()} (CSV)`}
              title="Download CSV"
              onClick={() => saveBlob(toCsv(table.header, table.rows), fileName)}
              className={cn('flex size-11 items-center justify-center rounded-[10px] border border-input-border bg-surface text-navy hover:bg-paper lg:size-8', FOCUS)}
            >
              <Download size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {empty ? (
        <p className="border-t border-line py-4 text-[14px] text-ink-muted">{empty}</p>
      ) : view === 'chart' ? (
        children
      ) : (
        <Table aria-label={`${title} as a table`}>
          <TableHeader>
            <TableRow className="border-line hover:bg-transparent">
              {table.header.map((h, i) => <TableHead key={h} className={cn('h-9 px-0 pr-4 text-label text-ink-muted', i > 0 && 'text-right')}>{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.map((r, i) => (
              <TableRow key={i} className="border-line hover:bg-paper">
                {r.map((c, j) => <TableCell key={j} className={cn('px-0 py-1.5 pr-4', j === 0 ? 'font-medium text-ink' : 'text-right tabular-nums text-ink')}>{c}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </m.section>
  )
}

/** The hover card, in tokens. `rows` turns the recharts payload into label/value lines. */
export function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[]; label?: string | number; format?: (v: number, key: string) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-sm">
      {label !== undefined && <p className="mb-1 font-semibold text-ink">{label}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-ink">
          <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ backgroundColor: p.color }} />
          <span className="text-ink-muted">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{format ? format(Number(p.value), String(p.dataKey)) : p.value}</span>
        </p>
      ))}
    </div>
  )
}

export interface Point {
  key: string
  label: string
  short: string
  value: number
}

/**
 * One bar per period in a single hue. With `seasons`, each run of months sits on its liturgical-season band and the
 * seasons in view are named in a legend, so the band colour is never the only signal.
 */
export function ColumnChart({
  points,
  label,
  name,
  seasons = false,
  height = 220,
  format,
  axisFormat,
}: {
  points: Point[]
  label: string
  /** Series name shown in the tooltip. */
  name: string
  seasons?: boolean
  height?: number
  format?: (v: number) => string
  /** Shorter form of `format` for the value axis. */
  axisFormat?: (v: number) => string
}) {
  const used = seasons ? Array.from(new Set(points.map((p) => seasonOfMonth(p.key)))) : []
  const runs: { season: Season; from: string; to: string }[] = []
  if (seasons) {
    for (const p of points) {
      const season = seasonOfMonth(p.key)
      const last = runs[runs.length - 1]
      if (last && last.season === season) last.to = p.short
      else runs.push({ season, from: p.short, to: p.short })
    }
  }
  return (
    <div>
      <div role="img" aria-label={label} style={{ height }} className="w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height }}>
          <BarChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            {runs.map((r) => (
              <ReferenceArea key={`${r.season}-${r.from}`} x1={r.from} x2={r.to} fill={SEASON_BAND[r.season]} fillOpacity={1} ifOverflow="visible" />
            ))}
            <XAxis dataKey="short" {...AXIS} interval="preserveStartEnd" minTickGap={8} />
            <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={axisFormat ? 60 : 32} tickFormatter={axisFormat} />
            <Tooltip cursor={{ fill: 'var(--paper-deep)', opacity: 0.6 }} content={<ChartTooltip format={format ? (v) => format(v) : undefined} />} />
            <Bar dataKey="value" name={name} fill="var(--navy)" radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {used.length > 0 && (
        <ul aria-label="Liturgical seasons" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted">
          {used.map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-3 rounded-[3px] border border-line" style={{ backgroundColor: SEASON_BAND[s] }} /> {SEASON_LABEL[s]}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
