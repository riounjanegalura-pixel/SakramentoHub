import { X } from 'lucide-react'
import { LIMITS } from './registerLabels'
import { REG_INPUT_SM, TEXT_LINK } from './registerForm'

export interface DetailRow {
  /** Stable key for React; never sent to the server. */
  key: number
  label: string
  value: string
}

let nextKey = 1
export const newRow = (label = '', value = ''): DetailRow => ({ key: nextKey++, label, value })

/** The label/value rows shown on a certificate (parents, sponsors, place of burial...). Each is editable and removable. */
export function DetailRowsEditor({
  rows,
  onChange,
  errors = {},
}: {
  rows: DetailRow[]
  onChange: (rows: DetailRow[]) => void
  /** Messages by row position: `labels[0]`, `values[0]`. */
  errors?: { label?: Record<number, string>; value?: Record<number, string> }
}) {
  const update = (key: number, patch: Partial<DetailRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[14px] font-semibold">On the certificate</legend>
      {rows.map((row, i) => (
        <div key={row.key} className="flex flex-col gap-1">
          <div className="grid grid-cols-[1fr_1.4fr_44px] items-center gap-2">
            <input
              aria-label={`Detail label ${i + 1}`}
              maxLength={LIMITS.detailLabel}
              value={row.label}
              onChange={(e) => update(row.key, { label: e.target.value })}
              className={REG_INPUT_SM}
            />
            <input
              aria-label={`Detail value ${i + 1}`}
              placeholder="Value"
              maxLength={LIMITS.detailValue}
              value={row.value}
              onChange={(e) => update(row.key, { value: e.target.value })}
              className={REG_INPUT_SM}
            />
            <button
              type="button"
              aria-label={`Remove detail ${i + 1}`}
              onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
              className="flex size-11 items-center justify-center rounded-[10px] text-ink-muted hover:bg-line/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {errors.label?.[i] && <p className="text-[14px] text-danger">{errors.label[i]}</p>}
          {errors.value?.[i] && <p className="text-[14px] text-danger">{errors.value[i]}</p>}
        </div>
      ))}
      <div>
        <button type="button" disabled={rows.length >= LIMITS.details} onClick={() => onChange([...rows, newRow()])} className={`${TEXT_LINK} disabled:opacity-50`}>
          Add a detail
        </button>
      </div>
    </fieldset>
  )
}

/** Rows to send: a row with no value is left out (the server drops it too), a row with a value but no label is sent so the server can name it. */
export function rowsToPayload(rows: DetailRow[]): { details: { label: string; value: string }[]; sentIndexes: number[] } {
  const details: { label: string; value: string }[] = []
  const sentIndexes: number[] = []
  rows.forEach((row, i) => {
    const value = row.value.trim()
    if (!value) return
    details.push({ label: row.label.trim(), value })
    sentIndexes.push(i)
  })
  return { details, sentIndexes }
}

/** Re-keys server errors like `details.2.label` from the sent list back to the row the user sees. */
export function rowErrors(fieldErrors: Record<string, string>, sentIndexes: number[]) {
  const label: Record<number, string> = {}
  const value: Record<number, string> = {}
  const used = new Set<string>()
  for (const [key, message] of Object.entries(fieldErrors)) {
    const m = /^details\.(\d+)\.(label|value)$/.exec(key)
    if (!m) continue
    const row = sentIndexes[Number(m[1])] ?? Number(m[1])
    const target = m[2] === 'label' ? label : value
    target[row] = message
    used.add(key)
  }
  return { label, value, used }
}
