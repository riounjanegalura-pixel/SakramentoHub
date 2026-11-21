import type { ScheduleItem } from '../../lib/types'

export type AgendaEntry =
  | { kind: 'item'; item: ScheduleItem; start: string; end: string }
  | { kind: 'travel'; side: 'before' | 'after'; minutes: number; start: string; end: string; forId: string }

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export const toHHMM = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/**
 * The day as the priest lives it: every item, plus the travel buffer the
 * scheduler reserves before and after an off-site booking — drawn so staff
 * see why the gap is not bookable.
 */
export function buildAgenda(items: ScheduleItem[], bufferMinutes: number): AgendaEntry[] {
  const entries: AgendaEntry[] = []
  for (const item of items) {
    // A booking's end can be missing (the server stores none for some requests): show it as a point in time.
    const itemEnd = item.end ?? item.start
    entries.push({ kind: 'item', item, start: item.start, end: itemEnd })
    if (item.type === 'booking' && item.isOffsite && bufferMinutes > 0) {
      entries.push({ kind: 'travel', side: 'before', minutes: bufferMinutes, forId: item.id, start: toHHMM(Math.max(0, toMinutes(item.start) - bufferMinutes)), end: item.start })
      entries.push({ kind: 'travel', side: 'after', minutes: bufferMinutes, forId: item.id, start: itemEnd, end: toHHMM(Math.min(23 * 60 + 59, toMinutes(itemEnd) + bufferMinutes)) })
    }
  }
  return entries.sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end))
}
