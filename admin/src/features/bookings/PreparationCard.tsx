import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Circle, Clock } from 'lucide-react'
import { tickMilestone } from '../../lib/data/bookings'
import { formatDate, formatManilaDate } from '../../lib/domain'
import type { AdminBooking, Milestone, MilestoneState } from '../../lib/types'
import { LicenseDialog } from './LicenseDialog'

const NOTE_MAX = 500 // server limit (MilestoneController)
const LICENSE_KEY = 'marriage_license'
const CIVIL_KEY = 'civil_registry'
/** The server refuses a missing note for this step. */
const NOTE_REQUIRED_KEYS = ['mixed_marriage_permission']

/** State is always words plus an icon, never colour alone. */
const STATE: Record<MilestoneState, { label: string; Icon: typeof Clock; tone: string }> = {
  done: { label: 'Done', Icon: CheckCircle2, tone: 'text-status-done-fg' },
  due: { label: 'Due now', Icon: Clock, tone: 'text-status-pending-fg' },
  overdue: { label: 'Overdue', Icon: AlertTriangle, tone: 'text-danger' },
  upcoming: { label: 'Upcoming', Icon: Circle, tone: 'text-ink-muted' },
}

/** One line saying how a finished step was done. */
function howDone(m: Milestone): string | null {
  if (m.source === 'document') return 'Document accepted'
  if (m.source !== 'staff') return null

  const parts: string[] = []
  const d = m.data
  if (d && 'art34' in d) parts.push('Art. 34 affidavit')
  else if (d) parts.push(`License ${d.licenseNumber}, issued ${formatDate(d.issuedOn)} at ${d.issuedAt}`)
  const who = m.doneBy?.fullName ?? 'staff'
  parts.push(`Ticked by ${who}${m.doneAt ? `, ${formatManilaDate(m.doneAt, false)}` : ''}`)
  return parts.join(' · ')
}

function NotePanel({ booking, row, onChanged, onClose }: { booking: AdminBooking; row: Milestone; onChanged: (b: AdminBooking) => void; onClose: () => void }) {
  const [note, setNote] = useState('')
  const required = NOTE_REQUIRED_KEYS.includes(row.key)
  const save = useMutation({
    mutationFn: () => tickMilestone(booking.id, row.key, note.trim() ? { done: true, note: note.trim() } : { done: true }),
    onSuccess: (updated) => {
      onClose()
      onChanged(updated)
    },
  })

  return (
    <div className="mt-3 flex flex-col gap-2">
      <label htmlFor={`note-${row.key}`} className="text-sm font-medium text-ink">
        {required ? 'Note (required)' : 'Note (optional)'}
      </label>
      <textarea id={`note-${row.key}`} rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} className="rounded-md border border-input-border p-2 text-sm" />
      {save.isError && <p role="alert" className="text-sm text-danger">{(save.error as Error).message}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={(required && !note.trim()) || save.isPending} onClick={() => save.mutate()} className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 min-h-11 lg:min-h-9">
          Save
        </button>
        <button type="button" onClick={onClose} className="rounded-xl min-h-11 border border-line px-4 py-2 text-sm font-semibold text-ink">Cancel</button>
      </div>
    </div>
  )
}

function Row({ booking, row, onChanged }: { booking: AdminBooking; row: Milestone; onChanged: (b: AdminBooking) => void }) {
  const [open, setOpen] = useState(false)
  const undo = useMutation({
    mutationFn: () => tickMilestone(booking.id, row.key, { done: false }),
    onSuccess: onChanged,
  })

  // After completion only the civil registry step can change; before it, that step is closed.
  const editable = row.manual && (booking.status === 'completed' ? row.key === CIVIL_KEY : row.key !== CIVIL_KEY)
  const canTick = editable && !row.done
  const canUndo = editable && row.done && row.source === 'staff'
  const { label, Icon, tone } = STATE[row.state]
  const how = howDone(row)
  const note = row.source === 'staff' ? row.note : null

  return (
    <li aria-label={row.label} className="border-b border-line py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{row.label}</p>
          <p className={`flex items-center gap-1 text-sm ${tone}`}>
            <Icon size={14} aria-hidden="true" /> <span>{label}</span>
            {row.dueDate && <span className="text-ink-muted"> · Due {formatDate(row.dueDate).replace(/^\w+, /, '')}</span>}
          </p>
          {how && <p className="text-sm text-ink-muted">{how}</p>}
          {note && <p className="text-sm text-ink">{note}</p>}
        </div>
        {row.gating && <span className="rounded-full bg-line/40 px-2 py-0.5 text-label font-semibold text-ink-muted">Required</span>}
        {canTick && !open && (
          <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-navy px-3 py-1.5 text-sm font-semibold text-white min-h-11 lg:min-h-9">
            Mark done
          </button>
        )}
        {canUndo && (
          <button type="button" disabled={undo.isPending} onClick={() => undo.mutate()} className="rounded-xl min-h-11 border border-line px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-60">
            Undo
          </button>
        )}
      </div>
      {undo.isError && <p role="alert" className="mt-2 text-sm text-danger">{(undo.error as Error).message}</p>}
      {canTick && open && row.key === LICENSE_KEY && <LicenseDialog booking={booking} onChanged={onChanged} onClose={() => setOpen(false)} />}
      {canTick && open && row.key !== LICENSE_KEY && <NotePanel booking={booking} row={row} onChanged={onChanged} onClose={() => setOpen(false)} />}
    </li>
  )
}

/** A wedding's preparation checklist (spec section 6): what is done, what is due, and the steps staff tick by hand. */
export function PreparationCard({ booking, onChanged }: { booking: AdminBooking; onChanged: (b: AdminBooking) => void }) {
  const shown = ['submitted', 'approved', 'completed'].includes(booking.status)
  if (booking.sacrament !== 'wedding' || !shown || booking.milestones.length === 0) return null

  const openRequired = booking.milestones.filter((m) => m.gating && !m.done)

  return (
    <section aria-label="Wedding preparation" className="rounded-2xl border border-line bg-surface px-6 py-[18px]">
      <h2 className="mb-2.5 font-display text-[20px] font-semibold text-navy">Wedding preparation</h2>
      {booking.status === 'approved' && openRequired.length > 0 && (
        <p role="status" className="mb-3 rounded-md bg-status-pending-bg p-3 text-sm text-status-pending-fg">
          Before this wedding can be marked completed: {openRequired.map((m) => m.label).join(', ')}.
        </p>
      )}
      <ul>
        {booking.milestones.map((m) => (
          <Row key={m.key} booking={booking} row={m} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  )
}
