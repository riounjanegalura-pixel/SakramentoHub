import * as m from 'motion/react-m'
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { durations, ease } from '../../lib/motion'
import type { DayCount } from '../../lib/types'
import { cn } from '../../lib/utils'
import { isWeekend, longMonthDay, shortMonthDay, weekdayLetter } from './dashboardModel'

const H2 = 'font-display font-semibold text-navy'
const TICK = { fill: 'var(--ink-muted)', fontVariantNumeric: 'tabular-nums' } as const

interface BarShapeProps {
  x?: number
  y?: number
  width?: number
  height?: number
  index?: number
}

/** A navy bar that grows up from the baseline once, with a short stagger. `minHeight` keeps an empty day visible as a sliver. */
function growBar(widthShare: number, radius: number, minHeight: number, skipEmpty: boolean) {
  return function GrowBar(p: unknown) {
    const { x = 0, y = 0, width = 0, height = 0, index = 0 } = p as BarShapeProps
    if (skipEmpty && height <= 0) return null
    const h = Math.max(height, minHeight)
    const top = y + height - h
    const w = width * widthShare
    return (
      <m.rect
        x={x + (width - w) / 2}
        width={w}
        rx={radius}
        style={{ fill: 'var(--navy)' }}
        initial={false}
        animate={{ y: top, height: h + radius }}
        transition={{ duration: durations.slow, ease: [...ease], delay: Math.min(index, 13) * 0.025 }}
      />
    )
  }
}

/** The weekend ground behind the Next 14 days bars: a paper band as wide as the day's column. */
function groundBar(p: unknown) {
  const { x = 0, y = 0, width = 0, height = 0 } = p as BarShapeProps
  return height > 0 ? <rect x={x} y={y} width={width} height={height} style={{ fill: 'var(--paper)' }} /> : null
}

interface LabelProps {
  x?: number | string
  y?: number | string
  width?: number | string
  value?: number | string
  index?: number
}

function countLabel(show: (index: number, value: number) => boolean, muteZero: boolean, size: number) {
  return function CountLabel(p: LabelProps) {
    const index = p.index ?? 0
    const value = Number(p.value ?? 0)
    if (!show(index, value)) return null
    const x = Number(p.x ?? 0) + Number(p.width ?? 0) / 2
    return (
      <m.text
        x={x}
        y={Number(p.y ?? 0) - 5}
        textAnchor="middle"
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: durations.base, delay: 0.2 + Math.min(index, 13) * 0.025 }}
        style={{ fill: muteZero && value === 0 ? 'var(--ink-muted)' : 'var(--ink)', fontSize: size, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </m.text>
    )
  }
}

function TipBox({ active, payload, format, unit }: { active?: boolean; payload?: Array<{ payload: DayCount }>; format: (d: string) => string; unit: string }) {
  const d = active ? payload?.[0]?.payload : undefined
  if (!d) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink shadow-sm">
      <p className="text-ink-muted">{format(d.date)}</p>
      <p className="font-semibold tabular-nums">
        {d.count} {d.count === 1 ? unit : `${unit}s`}
      </p>
    </div>
  )
}

/**
 * Visits in the next 14 days: one navy bar per day with its count above it, weekends on a paper ground. Every number is
 * printed, so the bars are never the only signal. Drawn with recharts, themed from the design tokens; the bars grow in with motion.
 */
export function AheadChart({ days, compact }: { days: DayCount[]; compact: boolean }) {
  const total = days.reduce((sum, d) => sum + d.count, 0)
  const max = Math.max(3, ...days.map((d) => d.count))
  const first = days[0]?.date
  const last = days[days.length - 1]?.date
  const label = first && last ? `Visits per day, ${longMonthDay(first)} to ${first.slice(0, 7) === last.slice(0, 7) ? Number(last.slice(8)) : longMonthDay(last)}. ${total} in total.` : 'Visits per day.'
  const height = compact ? 124 : 144
  const data = days.map((d) => ({ ...d, ground: isWeekend(d.date) ? max : 0 }))
  return (
    <section aria-label="Next 14 days" className={cn('min-w-0 rounded-2xl border border-line bg-surface', compact ? 'px-3.5 pb-2.5 pt-4' : 'px-[22px] pb-3 pt-[18px]')}>
      <div className={cn('flex items-baseline justify-between gap-2', compact ? 'mx-0.5 mb-2' : 'mb-2')}>
        <h2 className={cn(H2, compact ? 'text-[20px]' : 'text-[22px]')}>Next 14 days</h2>
        <p className="text-[14px] text-ink-muted">
          <span className="font-semibold tabular-nums text-ink">{total}</span> {total === 1 ? 'visit' : 'visits'}
        </p>
      </div>
      <div role="img" aria-label={label} className="min-w-0">
        <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 320, height }}>
          <BarChart data={data} margin={{ top: 18, right: 0, bottom: 0, left: 0 }} barCategoryGap={0} accessibilityLayer={false}>
            <YAxis hide domain={[0, max]} />
            <XAxis xAxisId="ground" dataKey="date" hide />
            <XAxis
              dataKey="date"
              axisLine={{ stroke: 'var(--line)' }}
              tickLine={false}
              interval={0}
              tickMargin={6}
              tick={{ ...TICK, fontSize: compact ? 11 : 12 }}
              tickFormatter={(d: string) => (compact ? weekdayLetter(d) : `${weekdayLetter(d)}${Number(d.slice(8))}`)}
            />
            <Tooltip cursor={false} isAnimationActive={false} content={<TipBox format={longMonthDay} unit="visit" />} />
            <Bar xAxisId="ground" dataKey="ground" shape={groundBar} isAnimationActive={false} legendType="none" tooltipType="none" />
            <Bar dataKey="count" shape={growBar(0.62, 3, 0, true)} isAnimationActive={false}>
              <LabelList dataKey="count" content={countLabel(() => true, true, 12) as never} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

/** New bookings per day for the last 14 days. The largest day and today are labelled; the rest are in the tooltip and the summary. */
export function BookingsChart({ days, compact }: { days: DayCount[]; compact: boolean }) {
  const total = days.reduce((sum, d) => sum + d.count, 0)
  const max = Math.max(1, ...days.map((d) => d.count))
  const peak = days.find((d) => d.count === max)
  const first = days[0]?.date
  const last = days[days.length - 1]?.date
  const label =
    first && last
      ? `New bookings per day, ${longMonthDay(first)} to ${longMonthDay(last)}. ${total} in total${total > 0 && peak ? `, most on ${longMonthDay(peak.date)} with ${peak.count}` : ''}.`
      : 'New bookings per day.'
  const ticks = [0, 7, 13].map((i) => days[i]?.date).filter((d): d is string => !!d)
  const height = compact ? 150 : 190
  return (
    <section aria-label="New bookings" className={cn('min-w-0 rounded-2xl border border-line bg-surface', compact ? 'px-4 pb-3.5 pt-4' : 'px-6 pb-4 pt-5')}>
      <div className={cn('flex items-end justify-between gap-3', compact ? 'mb-3' : 'mb-3')}>
        <div className={cn(!compact && 'flex flex-wrap items-baseline gap-x-3')}>
          <h2 className={cn(H2, compact ? 'text-[20px]' : 'text-[22px]')}>New bookings</h2>
          <p className={cn('text-[13px] text-ink-muted', compact && 'mt-0.5')}>Last 14 days</p>
        </div>
        <p className="flex items-baseline gap-2 text-[13px] text-ink-muted">
          <span className="font-display text-[36px] font-semibold leading-none tabular-nums text-navy">{total}</span>
          {!compact && 'in total'}
        </p>
      </div>
      {total === 0 ? (
        <p className="border-t border-line py-4 text-[14px] text-ink-muted">No new bookings in the last 14 days.</p>
      ) : (
        <div role="img" aria-label={label} className="min-w-0">
          <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 640, height }}>
            <BarChart data={days} margin={{ top: 22, right: 6, bottom: 0, left: 6 }} barCategoryGap="18%" accessibilityLayer={false}>
              <YAxis hide domain={[0, max]} />
              <XAxis
                dataKey="date"
                ticks={ticks}
                interval={0}
                axisLine={{ stroke: 'var(--line)' }}
                tickLine={false}
                tickMargin={8}
                tick={{ ...TICK, fontSize: 13 }}
                tickFormatter={shortMonthDay}
              />
              <Tooltip cursor={{ fill: 'var(--paper)' }} isAnimationActive={false} content={<TipBox format={shortMonthDay} unit="booking" />} />
              <Bar dataKey="count" shape={growBar(1, compact ? 3 : 4, 3, false)} isAnimationActive={false}>
                <LabelList dataKey="count" content={countLabel((i, v) => v === max || i === days.length - 1, false, 13) as never} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
