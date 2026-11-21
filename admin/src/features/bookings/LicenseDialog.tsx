import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '../../lib/api/client'
import { tickMilestone } from '../../lib/data/bookings'
import type { AdminBooking } from '../../lib/types'

const NUMBER_MAX = 40 // server limits (MilestoneController)
const PLACE_MAX = 120
const NOTE_MAX = 500

const inputClass = 'rounded-md border border-line p-2 text-sm'

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      {children}
      {error && <p id={`${id}-error`} className="text-sm text-danger">{error}</p>}
    </div>
  )
}

/** The marriage license step: the license's number, date and place of issue, or an Art. 34 affidavit with a note.
 * Server field errors (the 120-day rule lands on the issue date) show under the field they belong to. */
export function LicenseDialog({ booking, onChanged, onClose }: { booking: AdminBooking; onChanged: (b: AdminBooking) => void; onClose: () => void }) {
  const [art34, setArt34] = useState(false)
  const [licenseNumber, setLicenseNumber] = useState('')
  const [issuedOn, setIssuedOn] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [note, setNote] = useState('')

  const save = useMutation({
    mutationFn: () =>
      tickMilestone(
        booking.id,
        'marriage_license',
        art34
          ? { done: true, art34: true, note: note.trim() }
          : { done: true, licenseNumber: licenseNumber.trim(), issuedOn, issuedAt: issuedAt.trim() },
      ),
    onSuccess: (updated) => {
      onClose()
      onChanged(updated)
    },
  })

  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : {}
  const shownKeys = art34 ? ['note'] : ['licenseNumber', 'issuedOn', 'issuedAt']
  const hasFieldErrors = shownKeys.some((k) => fieldErrors[k])
  const describe = (id: string, key: string) => (fieldErrors[key] ? { 'aria-describedby': `${id}-error`, 'aria-invalid': true as const } : {})
  const complete = art34 ? note.trim() !== '' : licenseNumber.trim() !== '' && issuedOn !== '' && issuedAt.trim() !== ''

  return (
    <div className="mt-3 flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" checked={art34} onChange={(e) => { setArt34(e.target.checked); save.reset() }} className="size-4" />
        Art. 34 affidavit (no license needed)
      </label>

      {art34 ? (
        <Field id="license-note" label="Note (required)" error={fieldErrors.note}>
          <textarea id="license-note" rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} {...describe('license-note', 'note')} />
        </Field>
      ) : (
        <>
          <Field id="license-number" label="License number" error={fieldErrors.licenseNumber}>
            <input id="license-number" maxLength={NUMBER_MAX} value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className={inputClass} {...describe('license-number', 'licenseNumber')} />
          </Field>
          <Field id="license-issued-on" label="Date of issue" error={fieldErrors.issuedOn}>
            <input id="license-issued-on" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} className={inputClass} {...describe('license-issued-on', 'issuedOn')} />
          </Field>
          <Field id="license-issued-at" label="Place of issue" error={fieldErrors.issuedAt}>
            <input id="license-issued-at" maxLength={PLACE_MAX} value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} className={inputClass} {...describe('license-issued-at', 'issuedAt')} />
          </Field>
        </>
      )}

      {save.isError && !hasFieldErrors && <p role="alert" className="text-sm text-danger">{(save.error as Error).message}</p>}

      <div className="flex gap-2">
        <button type="button" disabled={!complete || save.isPending} onClick={() => save.mutate()} className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 min-h-11 lg:min-h-9">
          Save license
        </button>
        <button type="button" onClick={onClose} className="rounded-xl min-h-11 border border-line px-4 py-2 text-sm font-semibold text-ink">Cancel</button>
      </div>
    </div>
  )
}
