import crest from '../../assets/crest-sm.png'
import { SACRAMENT_LABEL } from '../../lib/constants'
import { dayTitle } from '../../lib/dates'
import { formatManilaDateTime, formatTime, PAYMENT_LABEL } from '../../lib/domain'
import type { ScheduleBookingItem, UnscheduledRequest } from '../../lib/types'
import { buildAgenda, type AgendaEntry } from '../schedule/agenda'
import type { ScheduleDay } from '../../lib/types'

const range = (a: string, b: string) => `${formatTime(a)}–${formatTime(b)}`

function notes(item: ScheduleBookingItem): string {
  const parts: string[] = []
  if (item.channel === 'walk_in') parts.push('Walk-in')
  if (item.paymentStatus && item.paymentStatus !== 'not_required') parts.push(PAYMENT_LABEL[item.paymentStatus])
  if (item.checkedInAt) parts.push(`Arrived ${new Date(item.checkedInAt).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}`)
  return parts.length ? `${parts.join('. ')}.` : ''
}

const COLS = 'px-2 py-3 align-top'

/**
 * The printed page for the selected day: black on white, a table the priest can carry. Hidden on screen and shown
 * when printing, where the rest of the Dashboard is hidden. Fixed ink colours here are deliberate: paper has no theme.
 */
export function DaySheet({
  date,
  day,
  travelBufferMinutes,
  urgent,
  printedBy,
  printedAt,
}: {
  date: string
  day: ScheduleDay | undefined
  travelBufferMinutes: number
  urgent: UnscheduledRequest[]
  printedBy: string
  printedAt: Date
}) {
  const entries: AgendaEntry[] = day ? buildAgenda(day.items, travelBufferMinutes) : []
  const long = dayTitle(date)
  return (
    <div data-testid="day-sheet" className="day-sheet hidden flex-col gap-6 bg-white text-black print:flex">
      <header className="flex items-end justify-between gap-4 border-b-2 border-black pb-3.5">
        <div>
          <p className="mb-1 text-[13px] font-semibold tracking-[0.04em]">DAY SHEET</p>
          <h1 className="font-display text-[30px] font-semibold leading-[1.1]">{long}</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <img src={crest} alt="" className="h-9 w-[30px] object-contain" />
          <span className="font-display text-[18px] font-semibold">SakramentoHub</span>
        </div>
      </header>

      {entries.length === 0 ? (
        <p className="text-[13px]">Nothing scheduled.</p>
      ) : (
        <table className="w-full border-collapse text-left text-[13px] leading-[1.45]">
          <thead>
            <tr className="border-b border-black">
              <th scope="col" className="w-[120px] py-2 pr-2 font-semibold">Time</th>
              <th scope="col" className="p-2 font-semibold">Booking</th>
              <th scope="col" className="w-[170px] p-2 font-semibold">Contact</th>
              <th scope="col" className="w-[150px] py-2 pl-2 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              if (e.kind === 'travel') {
                return (
                  <tr key={`t-${e.forId}-${e.side}`} className="border-b border-neutral-300 align-top text-ink-muted">
                    <td className="py-2.5 pr-2 tabular-nums">{range(e.start, e.end)}</td>
                    <td colSpan={3} className="p-2.5">
                      <em>Travel: {e.minutes} minutes {e.side} the off-site visit</em>
                    </td>
                  </tr>
                )
              }
              const item = e.item
              if (item.type !== 'booking') {
                return (
                  <tr key={`o-${i}`} className="border-b border-neutral-300 align-top">
                    <td className="py-3 pr-2 font-semibold tabular-nums">{range(item.start, item.end)}</td>
                    <td colSpan={3} className={COLS}>
                      <strong>{item.type === 'mass' ? item.title : `${SACRAMENT_LABEL[item.sacrament]} session`}</strong>
                      {item.type === 'session' && <> · {item.booked} of {item.capacity} booked</>}
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={item.id} className="border-b border-neutral-300 align-top">
                  <td className="py-3 pr-2 font-semibold tabular-nums">{range(item.start, item.end ?? item.start)}</td>
                  <td className={COLS}>
                    <strong>{item.subjectName}</strong>
                    <br />
                    {SACRAMENT_LABEL[item.sacrament]} · <span className="font-mono">{item.referenceNumber}</span>
                    <br />
                    {item.isOffsite ? `Off-site${item.location ? `: ${item.location}` : ''}` : 'At the church'}
                  </td>
                  <td className={COLS}>
                    {item.contactName ?? 'No contact on file'}
                    {item.contactRelationship ? ` (${item.contactRelationship})` : ''}
                    {item.contactPhone && (
                      <>
                        <br />
                        {item.contactPhone}
                      </>
                    )}
                  </td>
                  <td className="py-3 pl-2">{notes(item)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {urgent.length > 0 && (
        <p className="text-[13px] text-ink-muted">
          {urgent.length} urgent {urgent.length === 1 ? 'request has' : 'requests have'} no appointment time:{' '}
          {urgent.map((r) => `${r.subjectName}, anointing${r.contactPhone ? `, call ${r.contactPhone}` : ''}`).join('; ')}.
        </p>
      )}

      <footer className="mt-auto flex justify-between border-t border-neutral-300 pt-2.5 text-[12px] text-ink-muted">
        <span>Printed from SakramentoHub by {printedBy}</span>
        <span>{formatManilaDateTime(printedAt.toISOString())}</span>
      </footer>
    </div>
  )
}
