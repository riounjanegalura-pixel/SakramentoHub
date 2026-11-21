import { useState } from 'react'
import { NATIVE_SELECT } from '../../features/auth/authForm'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const daysIn = (year: number, month: number) => new Date(year, month, 0).getDate()
const pad = (n: number) => String(n).padStart(2, '0')

interface Props {
  id: string
  /** YYYY-MM-DD, or '' while any part is missing. */
  value: string
  onChange: (value: string) => void
  /** The youngest allowed year of birth is this many years back from the current year. */
  minAgeYears?: number
  invalid?: boolean
}

/**
 * Month, day and year chosen from three short lists. A calendar grid is slow for a birth date (decades back,
 * month by month); lists let someone type "1" "9" "9" "0" or scroll. Emits a full date only when all three are chosen.
 */
export function BirthDateSelects({ id, value, onChange, minAgeYears = 0, invalid }: Props) {
  const [y0, m0, d0] = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').map(Number) : [0, 0, 0]
  const [parts, setParts] = useState({ y: y0, m: m0, d: d0 })

  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: 111 - minAgeYears }, (_, i) => thisYear - minAgeYears - i)

  const update = (next: Partial<typeof parts>) => {
    const merged = { ...parts, ...next }
    // A shorter month or a non-leap year trims the day instead of leaving an impossible date.
    if (merged.y && merged.m && merged.d) merged.d = Math.min(merged.d, daysIn(merged.y, merged.m))
    setParts(merged)
    onChange(merged.y && merged.m && merged.d ? `${merged.y}-${pad(merged.m)}-${pad(merged.d)}` : '')
  }

  const maxDay = parts.y && parts.m ? daysIn(parts.y, parts.m) : 31
  const common = { 'aria-invalid': invalid ? true : undefined, className: NATIVE_SELECT } as const

  return (
    <div id={id} role="group" aria-label="Date of birth" className="grid grid-cols-[1.6fr_1fr_1.2fr] gap-2">
      <select {...common} aria-label="Month" autoComplete="bday-month" value={parts.m || ''} onChange={(e) => update({ m: Number(e.target.value) })}>
        <option value="" disabled>Month</option>
        {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
      </select>
      <select {...common} aria-label="Day" autoComplete="bday-day" value={parts.d || ''} onChange={(e) => update({ d: Number(e.target.value) })}>
        <option value="" disabled>Day</option>
        {Array.from({ length: maxDay }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
      </select>
      <select {...common} aria-label="Year" autoComplete="bday-year" value={parts.y || ''} onChange={(e) => update({ y: Number(e.target.value) })}>
        <option value="" disabled>Year</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  )
}
