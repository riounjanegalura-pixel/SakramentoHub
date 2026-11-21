import { Printer } from 'lucide-react'
import { formatDate, formatTime } from '../../lib/domain'
import type { Booking } from '../../lib/types'

const SUBJECT_PREFIXES = ['patient', 'child', 'confirmand', 'deceased']

function fullName(formData: Record<string, unknown>, prefix: string): string {
  return [formData[`${prefix}FirstName`], formData[`${prefix}LastName`]].filter((p) => typeof p === 'string' && p.trim() !== '').join(' ')
}

/** Who the pass is for: the couple, or the person the booking names. */
function passFor(b: Booking): string | null {
  if (b.sacrament === 'wedding') {
    const names = ['groom', 'bride'].map((p) => fullName(b.formData, p)).filter(Boolean)
    return names.length > 0 ? names.join(' & ') : null
  }
  for (const p of SUBJECT_PREFIXES) {
    const name = fullName(b.formData, p)
    if (name) return name
  }
  return null
}

function checkedInTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })
}

/** What the family shows at the parish office on the day. Only on a single-booking response, which is the one that carries the QR. */
export function DayPassCard({ booking, parishName }: { booking: Booking; parishName?: string }) {
  const qrSvg = booking.dayPass?.qrSvg
  if (!qrSvg) return null
  const who = passFor(booking)

  return (
    <section aria-labelledby="day-pass-heading" className="day-pass rounded-xl border border-line bg-surface p-4 text-sm">
      <h2 id="day-pass-heading" className="mb-3 font-semibold text-ink">Day pass</h2>
      <div className="flex flex-col items-center gap-3 text-center">
        {/*
          The QR is an SVG our own backend draws from a URL it builds itself (check-in link + this booking's
          reference). It carries no user-typed text, so it is inserted as markup here and nowhere else.
        */}
        <div
          role="img"
          aria-label="QR code for staff to scan"
          className="h-48 w-48 max-w-full rounded-lg border border-line bg-surface p-2 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <p className="font-mono text-base font-semibold text-ink">{booking.referenceNumber}</p>
        {who && <p className="font-semibold text-ink">{who}</p>}
        {booking.appointmentDate && booking.appointmentStart && (
          <p className="text-ink">{formatDate(booking.appointmentDate)} · {formatTime(booking.appointmentStart)}</p>
        )}
        {parishName && <p className="text-ink-muted">{parishName}</p>}
        <p className="text-ink-muted">Show this at the parish office on the day.</p>
        {booking.checkedInAt && <p className="font-semibold text-status-done-fg">Checked in at {checkedInTime(booking.checkedInAt)}</p>}
      </div>
      <button
        type="button"
        onClick={() => window.print()}
        className="no-print mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-navy py-3 font-semibold text-navy"
      >
        <Printer size={16} aria-hidden="true" /> Print
      </button>
    </section>
  )
}
