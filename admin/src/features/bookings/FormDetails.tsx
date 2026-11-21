import { Disclosure } from '../../components/shared/Disclosure'
import { humanizeKey } from '../../lib/domain'
import type { Sacrament } from '../../lib/types'
import { AuthenticatedFileLink } from './AuthenticatedFileLink'
import { enumLabel, groupFields } from './formSections'

const HIDDEN = /(RegionCode|ProvinceCode|CityCode|BarangayCode)$/

type Row = Record<string, unknown>

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)

function display(key: string, value: unknown) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string' && value.startsWith('/documents/')) return <AuthenticatedFileLink path={value} label="View document" />
  const label = enumLabel(key, value)
  if (label !== null) return label
  if (Array.isArray(value)) {
    const items = value.filter((v) => v !== null && v !== undefined && v !== '').map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)))
    return items.length ? items.join(', ') : '—'
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** A table only for a non-empty list made entirely of objects (sponsors); null entries are skipped. */
function tableRows(value: unknown): Row[] | null {
  if (!Array.isArray(value)) return null
  const present = value.filter((v) => v !== null && v !== undefined)
  return present.length > 0 && present.every(isRow) ? present : null
}

function SponsorTable({ name, rows, withCaption }: { name: string; rows: Row[]; withCaption: boolean }) {
  return (
    <table aria-label={humanizeKey(name)} className="w-full text-left text-sm">
      {withCaption && <caption className="mb-2 text-left text-label font-semibold text-ink-muted">{humanizeKey(name)}</caption>}
      <thead className="text-label text-ink-muted">
        <tr><th className="py-1">Name</th><th>Role</th><th>Age</th><th>Religion</th><th>Residence</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line">
            <td className="py-1">{[r.firstName, r.middleName, r.lastName].filter(Boolean).join(' ')}</td>
            <td>{r.role === 'ninang' ? 'Ninang' : 'Ninong'}</td>
            <td>{String(r.age ?? '—')}</td>
            <td>{String(r.religion ?? '—')}</td>
            <td>{String(r.residence ?? '—')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Fields({ entries, withCaption }: { entries: Array<[string, unknown]>; withCaption: boolean }) {
  const scalars = entries.filter(([, v]) => tableRows(v) === null)
  const lists = entries.flatMap(([k, v]): Array<[string, Row[]]> => {
    const rows = tableRows(v)
    return rows ? [[k, rows]] : []
  })

  return (
    <div className="flex flex-col gap-4">
      {scalars.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {scalars.map(([key, value]) => (
            <div key={key}>
              <dt className="text-label text-ink-muted">{humanizeKey(key)}</dt>
              <dd className="text-ink">{display(key, value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {lists.map(([key, rows]) => (
        <SponsorTable key={key} name={key} rows={rows} withCaption={withCaption} />
      ))}
    </div>
  )
}

/** The one line a closed section shows: its first few filled-in answers, or the number of sponsors. */
function summarize(keys: string[], values: Map<string, unknown>): string {
  const parts: string[] = []
  for (const k of keys) {
    const v = values.get(k)
    const rows = tableRows(v)
    if (rows) {
      parts.push(`${rows.length} ${rows.length === 1 ? 'sponsor' : 'sponsors'}`)
      continue
    }
    if (typeof v === 'string' && v !== '' && !v.startsWith('/documents/')) parts.push(enumLabel(k, v) ?? v)
    else if (typeof v === 'number') parts.push(String(v))
    if (parts.length >= 3) break
  }
  return parts.join(' · ')
}

/**
 * The answers on a booking. With a `sacrament` they are grouped into sections
 * (Child, Father, Mother, Sponsors…) from formSections.ts; without one they
 * stay a flat list. `hiddenKeys` are fields shown elsewhere — the document
 * fields live in the Documents card.
 */
export function FormDetails({
  formData,
  sacrament,
  hiddenKeys = [],
  collapsible = false,
}: {
  formData: Record<string, unknown>
  sacrament?: Sacrament
  hiddenKeys?: string[]
  /** Each section becomes its own closed Disclosure with a one-line summary. */
  collapsible?: boolean
}) {
  const entries = Object.entries(formData).filter(([k]) => !HIDDEN.test(k) && !hiddenKeys.includes(k))

  if (!sacrament) return <Fields entries={entries} withCaption />

  const values = new Map(entries)
  if (collapsible) {
    return (
      <div className="flex flex-col gap-2.5">
        {groupFields(sacrament, entries.map(([k]) => k)).map((section) => (
          <Disclosure key={section.title} title={section.title} summary={summarize(section.keys, values)} className="bg-paper">
            <Fields entries={section.keys.map((k): [string, unknown] => [k, values.get(k)])} withCaption={false} />
          </Disclosure>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      {groupFields(sacrament, entries.map(([k]) => k)).map((section) => (
        <section key={section.title} aria-label={section.title}>
          <h4 className="mb-2 text-label font-semibold text-navy">{section.title}</h4>
          <Fields entries={section.keys.map((k): [string, unknown] => [k, values.get(k)])} withCaption={false} />
        </section>
      ))}
    </div>
  )
}
