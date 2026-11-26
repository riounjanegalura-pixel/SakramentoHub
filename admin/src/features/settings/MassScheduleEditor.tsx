import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { MassRow } from '../../lib/types'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const NEW_MASS: MassRow = { label: 'Mass', time: '06:00', durationMinutes: 60, weekdays: [7], firstFriday: false }

const chip = (on: boolean) =>
  `inline-flex min-h-11 min-w-12 cursor-pointer items-center justify-center rounded-xl px-3 text-[14px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
    on ? 'bg-surface font-semibold text-navy ring-2 ring-inset ring-navy' : 'bg-paper-deep font-medium text-ink-muted'
  }`

/**
 * The fixed weekly Masses. No sacrament is offered while one is on, or inside the Mass buffer around it, so the office
 * enters each Mass once here instead of closing the same times by hand every week.
 */
export function MassScheduleEditor({ rows, onChange, disabled }: { rows: MassRow[]; onChange: (rows: MassRow[]) => void; disabled: boolean }) {
  const update = (i: number, patch: Partial<MassRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Mass schedule">
      <div>
        <h3 className="text-sm font-medium text-ink">Mass schedule</h3>
        <p className="text-[13px] text-ink-muted">Times sacraments cannot be booked: each Mass, plus the Mass buffer before and after it</p>
      </div>
      {rows.length === 0 && <p className="text-sm text-ink-muted">No Mass times yet, so nothing is closed for Mass.</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((row, i) => {
          const noDay = !row.firstFriday && row.weekdays.length === 0
          const badTime = !/^\d{2}:\d{2}$/.test(row.time)
          const badLength = !Number.isInteger(row.durationMinutes) || row.durationMinutes < 15 || row.durationMinutes > 240
          return (
            <li key={i}>
              <div role="group" aria-label={`Mass ${i + 1}`} className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_8rem_auto] sm:items-end">
                <label className="grid gap-1.5 text-sm font-medium text-ink">
                  Name
                  <Input disabled={disabled} maxLength={60} value={row.label} onChange={(e) => update(i, { label: e.target.value })} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-ink">
                  Starts
                  <Input type="time" disabled={disabled} value={row.time} onChange={(e) => update(i, { time: e.target.value })} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-ink">
                  Minutes
                  <Input type="number" min={15} max={240} step={5} disabled={disabled} value={row.durationMinutes} onChange={(e) => update(i, { durationMinutes: Number(e.target.value || 0) })} />
                </label>
                <Button type="button" variant="outline" size="icon" aria-label={`Remove Mass ${i + 1}`} disabled={disabled} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Days">
                {DAYS.map((d, k) => {
                  const day = k + 1
                  const on = !row.firstFriday && row.weekdays.includes(day)
                  return (
                    <label key={day} className={chip(on)}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        aria-label={d}
                        disabled={disabled || row.firstFriday}
                        checked={on}
                        onChange={() => update(i, { weekdays: (on ? row.weekdays.filter((x) => x !== day) : [...row.weekdays, day]).sort((a, b) => a - b) })}
                      />
                      {d}
                    </label>
                  )
                })}
                <label className={chip(row.firstFriday)}>
                  <input type="checkbox" className="sr-only" disabled={disabled} checked={row.firstFriday} onChange={() => update(i, { firstFriday: !row.firstFriday, weekdays: [] })} />
                  First Friday only
                </label>
              </div>
              {noDay && <p role="alert" className="text-sm font-medium text-danger">Choose at least one day, or the first Friday.</p>}
              {badTime && <p role="alert" className="text-sm font-medium text-danger">Choose the time this Mass starts.</p>}
              {badLength && <p role="alert" className="text-sm font-medium text-danger">A Mass lasts between 15 and 240 minutes.</p>}
              </div>
            </li>
          )
        })}
      </ul>
      {!disabled && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...rows, { ...NEW_MASS }])}>
          <Plus aria-hidden="true" />
          Add a Mass
        </Button>
      )}
    </div>
  )
}
