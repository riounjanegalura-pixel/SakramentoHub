// Calendar math on plain "YYYY-MM-DD" strings. Everything goes through UTC so a
// machine in another time zone cannot shift a day.

const pad = (n: number) => String(n).padStart(2, '0')

export function monthBounds(date: string): { start: string; end: string } {
  const [y, m] = date.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` }
}

/** The first day of the month `delta` months away from `date`'s month. */
export function shiftMonth(date: string, delta: number): string {
  const [y, m] = date.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`
}

/** Sunday-first weeks of the month containing `date`; cells outside the month are null. */
export function monthGrid(date: string): (string | null)[][] {
  const { start, end } = monthBounds(date)
  const lead = new Date(`${start}T00:00:00Z`).getUTCDay()
  const days = Number(end.slice(8))
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${start.slice(0, 8)}${pad(i + 1)}`),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function monthTitle(date: string): string {
  return new Date(`${date.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function dayTitle(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** `date` moved by `delta` calendar days. */
export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** The Sunday-first week that holds `date`, as seven days. */
export function weekOf(date: string): string[] {
  const start = addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay())
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}
