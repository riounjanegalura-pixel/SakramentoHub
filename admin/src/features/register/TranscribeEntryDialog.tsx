import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '../../lib/api/client'
import { fetchSettings } from '../../lib/data/settings'
import { fetchNextNumbers, transcribeEntry } from '../../lib/data/register'
import type { TranscribeInput } from '../../lib/data/register'
import { parishToday } from '../../lib/domain'
import type { RegisterEntry, TranscribableSacrament } from '../../lib/types'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { DetailRowsEditor, newRow, rowErrors, rowsToPayload } from './DetailRowsEditor'
import type { DetailRow } from './DetailRowsEditor'
import { BTN_OUTLINE, BTN_PRIMARY, REG_DIALOG, REG_INPUT, RegField } from './registerForm'
import { DEFAULT_DETAIL_LABELS, LIMITS, REGISTER_LABEL, TRANSCRIBE_OPTIONS } from './registerLabels'

interface Duplicates {
  message: string
  entries: { id: string; registerNumber: string }[]
}

const defaultRows = (sacrament: TranscribableSacrament): DetailRow[] => DEFAULT_DETAIL_LABELS[sacrament].map((label) => newRow(label))

/** Copies one entry from the old paper register book into the system, in the year the ceremony took place. A dialog on a desktop, a bottom sheet on a phone. */
export function TranscribeEntryDialog({
  onClose,
  onCreated,
  initialSacrament = 'baptism',
  initialName = '',
}: {
  onClose: () => void
  onCreated: (entry: RegisterEntry) => void
  /** Optional starting values (a certificate request knows its register and name); without them the form starts as ever. */
  initialSacrament?: TranscribableSacrament
  initialName?: string
}) {
  const queryClient = useQueryClient()
  const [sacrament, setSacrament] = useState<TranscribableSacrament>(initialSacrament)
  const [rows, setRows] = useState<DetailRow[]>(() => defaultRows(initialSacrament))
  const [subjectName, setSubjectName] = useState(initialName)
  const [ceremonyDate, setCeremonyDate] = useState('')
  const [editedMinister, setEditedMinister] = useState<string | null>(null)
  // Book and page count on by themselves; the office can still overwrite them when copying an old paper entry.
  const nextNumbers = useQuery({ queryKey: ['admin-register-next-numbers'], queryFn: fetchNextNumbers })
  const [typedBook, setBookNo] = useState<string | null>(null)
  const [typedPage, setPageNo] = useState<string | null>(null)
  const [lineNo, setLineNo] = useState('')
  const bookNo = typedBook ?? nextNumbers.data?.bookNo ?? ''
  const pageNo = typedPage ?? nextNumbers.data?.pageNo ?? ''
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({})
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [sentIndexes, setSentIndexes] = useState<number[]>([])
  const [duplicates, setDuplicates] = useState<Duplicates | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Most paper entries were made by earlier priests, so the field starts empty; the button is the one-click path for a new record.
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: fetchSettings })
  const minister = editedMinister ?? ''
  const priestName = settings.data?.parish.priestName

  /** Any edit invalidates a duplicate warning: the entry is checked again on the next save. */
  function edit<T>(setter: (value: T) => void, field?: string) {
    return (value: T) => {
      setter(value)
      setDuplicates(null)
      setMessage(null)
      if (field) {
        setClientErrors((e) => ({ ...e, [field]: '' }))
        setServerErrors((e) => ({ ...e, [field]: '' }))
      }
    }
  }

  const save = useMutation({
    mutationFn: (input: TranscribeInput) => transcribeEntry(input),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ['admin-register'] })
      onCreated(entry)
    },
    onError: (e) => {
      setMessage(null)
      if (e instanceof ApiError && e.status === 409 && Array.isArray(e.body?.duplicates)) {
        setServerErrors({})
        setDuplicates({ message: e.message, entries: e.body.duplicates as Duplicates['entries'] })
        return
      }
      setDuplicates(null)
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length > 0) {
        setServerErrors(e.fieldErrors)
        return
      }
      setServerErrors({})
      setMessage((e as Error).message)
    },
  })

  function submit(confirmDuplicate: boolean) {
    const errors: Record<string, string> = {}
    if (!subjectName.trim()) errors.subjectName = 'Enter the name.'
    if (!ceremonyDate) errors.ceremonyDate = 'Enter the ceremony date.'
    if (!minister.trim()) errors.minister = 'Enter the minister.'
    if (!bookNo.trim()) errors.bookNo = 'Enter the book number.'
    if (!pageNo.trim()) errors.pageNo = 'Enter the page number.'
    setClientErrors(errors)
    if (Object.keys(errors).length > 0) return

    const { details, sentIndexes: sent } = rowsToPayload(rows)
    setSentIndexes(sent)
    setServerErrors({})
    setMessage(null)
    save.mutate({
      sacrament,
      ceremonyDate,
      subjectName: subjectName.trim(),
      minister: minister.trim(),
      details,
      bookNo: bookNo.trim(),
      pageNo: pageNo.trim(),
      ...(lineNo.trim() ? { lineNo: lineNo.trim() } : {}),
      ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
    })
  }

  const rowErr = rowErrors(serverErrors, sentIndexes)
  const fieldError = (field: string) => clientErrors[field] || serverErrors[field] || ''
  // Server messages for keys with no field of their own (e.g. a `details` list that is too long) must not vanish.
  const rendered = new Set(['sacrament', 'ceremonyDate', 'subjectName', 'minister', 'bookNo', 'pageNo', 'lineNo', ...rowErr.used])
  const stray = Object.entries(serverErrors).filter(([k, v]) => v && !rendered.has(k)).map(([, v]) => v)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={REG_DIALOG} aria-label="Add entry from paper book">
        <div>
          <DialogTitle className="mb-1.5 font-display text-2xl font-semibold leading-tight text-navy">Add entry from paper book</DialogTitle>
          <DialogDescription className="text-[14px] leading-normal text-ink-muted">Copy an old register entry into the system.</DialogDescription>
        </div>

        <RegField label="Register" htmlFor="tx-register" required error={fieldError('sacrament')}>
          <select
            id="tx-register"
            value={sacrament}
            onChange={(e) => {
              const next = e.target.value as TranscribableSacrament
              setSacrament(next)
              setRows(defaultRows(next))
              setDuplicates(null)
              setServerErrors({})
            }}
            className={REG_INPUT}
          >
            {TRANSCRIBE_OPTIONS.map((s) => <option key={s} value={s}>{REGISTER_LABEL[s]}</option>)}
          </select>
        </RegField>
        <RegField label="Name" htmlFor="tx-name" required error={fieldError('subjectName')}>
          <input id="tx-name" maxLength={LIMITS.subjectName} value={subjectName} onChange={(e) => edit(setSubjectName, 'subjectName')(e.target.value)} className={REG_INPUT} />
        </RegField>
        <div className="flex flex-col gap-4 md:flex-row md:gap-3">
          <RegField label="Ceremony date" htmlFor="tx-date" required error={fieldError('ceremonyDate')} className="md:flex-1">
            <input id="tx-date" type="date" max={parishToday()} value={ceremonyDate} onChange={(e) => edit(setCeremonyDate, 'ceremonyDate')(e.target.value)} className={REG_INPUT} />
          </RegField>
          <RegField label="Minister" htmlFor="tx-minister" required error={fieldError('minister')} className="md:flex-1">
            <input id="tx-minister" maxLength={LIMITS.minister} value={minister} onChange={(e) => edit(setEditedMinister, 'minister')(e.target.value)} className={REG_INPUT} />
            {priestName && (
              <button
                type="button"
                onClick={() => edit(setEditedMinister, 'minister')(priestName)}
                className="min-h-11 self-start text-[14px] font-semibold text-navy underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Use {priestName}
              </button>
            )}
          </RegField>
        </div>

        <DetailRowsEditor
          rows={rows}
          onChange={(next) => {
            setRows(next)
            setDuplicates(null)
            setServerErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('details'))))
          }}
          errors={{ label: rowErr.label, value: rowErr.value }}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[14px] font-semibold">Where it is in the paper book</legend>
          <div className="flex gap-2.5">
            <RegField label="Book no." htmlFor="tx-book" required error={fieldError('bookNo')} className="flex-1">
              <input id="tx-book" maxLength={LIMITS.paper} value={bookNo} onFocus={(e) => e.target.select()} onChange={(e) => edit(setBookNo, 'bookNo')(e.target.value)} className={REG_INPUT} />
            </RegField>
            <RegField label="Page no." htmlFor="tx-page" required error={fieldError('pageNo')} className="flex-1">
              <input id="tx-page" maxLength={LIMITS.paper} value={pageNo} onFocus={(e) => e.target.select()} onChange={(e) => edit(setPageNo, 'pageNo')(e.target.value)} className={REG_INPUT} />
            </RegField>
            <RegField label="Line no." htmlFor="tx-line" optional error={fieldError('lineNo')} className="flex-1">
              <input id="tx-line" maxLength={LIMITS.paper} value={lineNo} onChange={(e) => edit(setLineNo, 'lineNo')(e.target.value)} className={REG_INPUT} />
            </RegField>
          </div>
        </fieldset>

        {duplicates && (
          <div role="alert" className="rounded-xl bg-status-pending-bg px-3.5 py-3 text-[14px] leading-normal text-status-pending-fg">
            <p>{duplicates.message}</p>
            <ul className="mt-1 list-disc pl-5">
              {duplicates.entries.map((d) => (
                <li key={d.id}>
                  <Link to={`/register/${d.id}`} className="font-mono font-medium underline">{d.registerNumber}</Link>
                </li>
              ))}
            </ul>
            <p className="mt-1">If this is a different person or a second record, add it anyway.</p>
          </div>
        )}
        {message && <p role="alert" className="text-[14px] text-danger">{message}</p>}
        {stray.map((m) => <p key={m} role="alert" className="text-[14px] text-danger">{m}</p>)}

        <div className="flex flex-col-reverse gap-2.5 pt-2 md:flex-row md:justify-end">
          <button type="button" onClick={onClose} className={BTN_OUTLINE}>Cancel</button>
          <button type="button" disabled={save.isPending} onClick={() => submit(!!duplicates)} className={BTN_PRIMARY}>
            {duplicates ? 'Add anyway' : 'Save entry'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
