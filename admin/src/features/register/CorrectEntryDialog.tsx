import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '../../lib/api/client'
import { correctEntry } from '../../lib/data/register'
import type { CorrectInput } from '../../lib/data/register'
import { parishToday } from '../../lib/domain'
import type { RegisterEntry, RegisterEntryDetail } from '../../lib/types'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { BTN_OUTLINE, BTN_PRIMARY, REG_DIALOG, REG_INPUT, REG_TEXTAREA, RegField } from './registerForm'
import { DetailRowsEditor, newRow, rowErrors, rowsToPayload } from './DetailRowsEditor'
import type { DetailRow } from './DetailRowsEditor'
import { LIMITS } from './registerLabels'

/**
 * Admin only. Fixes what the certificate says; the register number, year and verification code never change,
 * and the old values stay in the history with the reason given here.
 */
export function CorrectEntryDialog({ entry, onClose, onSaved }: { entry: RegisterEntryDetail; onClose: () => void; onSaved: (entry: RegisterEntry) => void }) {
  const snap = entry.snapshot
  const [subjectName, setSubjectName] = useState(snap.subjectName)
  const [ceremonyDate, setCeremonyDate] = useState(snap.ceremonyDate)
  const [minister, setMinister] = useState(snap.minister)
  const [rows, setRows] = useState<DetailRow[]>(() => snap.details.map((d) => newRow(d.label, d.value)))
  const [reason, setReason] = useState('')
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [sentIndexes, setSentIndexes] = useState<number[]>([])
  const [message, setMessage] = useState<string | null>(null)

  const { details } = rowsToPayload(rows)
  const detailsChanged = JSON.stringify(details) !== JSON.stringify(snap.details.filter((d) => d.value.trim()).map((d) => ({ label: d.label.trim(), value: d.value.trim() })))

  const changes: Omit<CorrectInput, 'reason'> = {}
  if (subjectName.trim() !== snap.subjectName) changes.subjectName = subjectName.trim()
  if (ceremonyDate !== snap.ceremonyDate) changes.ceremonyDate = ceremonyDate
  if (minister.trim() !== snap.minister) changes.minister = minister.trim()
  if (detailsChanged) changes.details = details
  const hasChange = Object.keys(changes).length > 0
  const canSave = hasChange && reason.trim() !== ''

  const save = useMutation({
    mutationFn: (input: CorrectInput) => correctEntry(entry.id, input),
    onSuccess: onSaved,
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length > 0) {
        setServerErrors(e.fieldErrors)
        setMessage(null)
        return
      }
      setServerErrors({})
      setMessage((e as Error).message)
    },
  })

  function submit() {
    const sent = rowsToPayload(rows)
    setSentIndexes(sent.sentIndexes)
    setServerErrors({})
    setMessage(null)
    save.mutate({ reason: reason.trim(), ...changes })
  }

  const rowErr = rowErrors(serverErrors, sentIndexes)
  const rendered = new Set(['subjectName', 'ceremonyDate', 'minister', 'reason', ...rowErr.used])
  const stray = Object.entries(serverErrors).filter(([k, v]) => v && !rendered.has(k)).map(([, v]) => v)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={REG_DIALOG} aria-label="Correct this entry">
        <div>
          <DialogTitle className="mb-1.5 font-display text-2xl font-semibold leading-tight text-navy">Correct this entry</DialogTitle>
          <DialogDescription className="text-[14px] leading-normal text-ink-muted">
            The register number and verification code stay the same, and the certificate shows the corrected words. The old values are kept in the history.
          </DialogDescription>
        </div>
        <RegField label="Name" htmlFor="co-name" required error={serverErrors.subjectName}>
          <input id="co-name" maxLength={LIMITS.subjectName} value={subjectName} onChange={(e) => setSubjectName(e.target.value)} className={REG_INPUT} />
        </RegField>
        <div className="flex flex-col gap-4 md:flex-row md:gap-3">
          <RegField label="Ceremony date" htmlFor="co-date" required error={serverErrors.ceremonyDate} className="md:flex-1">
            <input id="co-date" type="date" max={parishToday()} value={ceremonyDate} onChange={(e) => setCeremonyDate(e.target.value)} className={REG_INPUT} />
          </RegField>
          <RegField label="Minister" htmlFor="co-minister" required error={serverErrors.minister} className="md:flex-1">
            <input id="co-minister" maxLength={LIMITS.minister} value={minister} onChange={(e) => setMinister(e.target.value)} className={REG_INPUT} />
          </RegField>
        </div>
        <DetailRowsEditor rows={rows} onChange={setRows} errors={{ label: rowErr.label, value: rowErr.value }} />
        <RegField label="Reason for the correction" htmlFor="co-reason" required error={serverErrors.reason}>
          <textarea id="co-reason" rows={3} maxLength={LIMITS.reason} value={reason} onChange={(e) => setReason(e.target.value)} className={REG_TEXTAREA} />
        </RegField>
        {!hasChange && <p className="text-[14px] text-ink-muted">Change at least one field.</p>}
        {message && <p role="alert" className="text-[14px] text-danger">{message}</p>}
        {stray.map((m) => <p key={m} role="alert" className="text-[14px] text-danger">{m}</p>)}
        <div className="flex flex-col-reverse gap-2.5 pt-2 md:flex-row md:justify-end">
          <button type="button" onClick={onClose} className={BTN_OUTLINE}>Cancel</button>
          <button type="button" disabled={!canSave || save.isPending} onClick={submit} className={BTN_PRIMARY}>Save correction</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
