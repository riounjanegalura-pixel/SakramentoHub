import { Pencil } from 'lucide-react'
import { useBookingStore } from '../../stores/booking-store'
import { useDeskStore } from '../../stores/desk-store'
import { relationshipLabel } from './contactStep'

/** Review card for the walk-in's contact, the account link and a lead-time waiver. */
export function DeskContactSection({ onEdit, onEditSchedule }: { onEdit: () => void; onEditSchedule: () => void }) {
  const contact = useDeskStore((s) => s.contact)
  const linked = useDeskStore((s) => s.linkedAccount)
  const waiveLeadTime = useDeskStore((s) => s.waiveLeadTime)
  const waiveReason = useDeskStore((s) => s.waiveReason)
  const formData = useBookingStore((s) => s.formData)

  const rows: Array<[string, string]> = contact
    ? [
        ['Name', contact.fullName],
        ['Mobile', contact.phone],
        ...(contact.email ? ([['Email', contact.email]] as Array<[string, string]>) : []),
        ['Receiving it', relationshipLabel(formData)],
        ['Account', linked ? `Linked to ${linked.fullName}` : 'Not linked'],
      ]
    : []

  return (
    <>
      <section className="mb-3 rounded-xl border border-line bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-ink">Walk-in contact</h3>
          <button type="button" onClick={onEdit} className="flex items-center gap-1 text-sm font-medium text-navy">
            <Pencil size={14} aria-hidden="true" /> Edit
          </button>
        </div>
        {contact ? (
          <dl className="flex flex-col gap-1.5 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="text-right font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-ink-muted">No contact entered yet.</p>
        )}
      </section>

      {waiveLeadTime && (
        <section className="mb-3 rounded-xl border border-status-pending-fg/40 bg-status-pending-bg p-4 text-sm">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-semibold text-status-pending-fg">Lead time waived</h3>
            <button type="button" onClick={onEditSchedule} className="flex items-center gap-1 text-sm font-medium text-navy">
              <Pencil size={14} aria-hidden="true" /> Edit
            </button>
          </div>
          <p className="text-ink">{waiveReason.trim() || 'No reason given yet.'}</p>
          <p className="mt-1 text-ink-muted">Recorded in the audit log with this reason.</p>
        </section>
      )}
    </>
  )
}
