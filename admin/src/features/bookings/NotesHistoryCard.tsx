import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { addBookingNote, fetchBookingHistory, fetchBookingNotes } from '../../lib/data/bookings'
import { formatManilaDateTime } from '../../lib/domain'
import { cn } from '../../lib/utils'
import { describeHistory } from './historyLabels'
import { CARD, FieldError, FOCUS, INPUT, TabBar } from './parts'

const NOTE_MAX = 2000 // server limit (BookingNoteController)

type Tab = 'notes' | 'history'

/**
 * Staff notes and the booking's history in one card with two tabs. Notes are append-only on purpose: there is no
 * edit or delete, so the record of who said what stays trustworthy. History is the audit trail, oldest first.
 */
export function NotesHistoryCard({ bookingId, className }: { bookingId: string; className?: string }) {
  const queryClient = useQueryClient()
  const id = useId()
  const [tab, setTab] = useState<Tab>('notes')
  const [body, setBody] = useState('')

  const notes = useQuery({ queryKey: ['admin-booking-notes', bookingId], queryFn: () => fetchBookingNotes(bookingId) })
  const history = useQuery({ queryKey: ['admin-booking-history', bookingId], queryFn: () => fetchBookingHistory(bookingId) })

  const add = useMutation({
    mutationFn: () => addBookingNote(bookingId, body.trim()),
    onSuccess: () => {
      setBody('')
      queryClient.invalidateQueries({ queryKey: ['admin-booking-notes', bookingId] })
    },
  })

  return (
    <section aria-label="Notes and history" className={cn(CARD, 'px-6 pb-[18px] pt-2', className)}>
      <TabBar
        label="Notes and history"
        idPrefix={id}
        value={tab}
        onChange={setTab}
        className="mb-3.5 gap-x-6"
        tabs={[
          { key: 'notes', label: 'Notes', count: notes.data?.length },
          { key: 'history', label: 'History', count: history.data?.length },
        ]}
      />

      {tab === 'notes' && (
        <div role="tabpanel" aria-labelledby={`${id}-notes`}>
          <p className="mb-3 text-[13px] text-ink-muted">Staff only. Never shown to the parishioner. Notes cannot be edited or deleted.</p>
          {notes.isLoading && <p role="status" className="text-[14px] text-ink-muted">Loading the notes…</p>}
          {notes.isError && <FieldError>The notes did not load: {(notes.error as Error).message}</FieldError>}
          {notes.data && notes.data.length === 0 && <p className="mb-3 text-[14px] text-ink-muted">No notes yet.</p>}
          {notes.data && notes.data.length > 0 && (
            <ul className="mb-3.5 flex flex-col gap-3">
              {notes.data.map((n) => (
                <li key={n.id} className="text-[14px] leading-normal">
                  <span className="block text-[13px] text-ink-muted">
                    {n.author?.fullName ?? 'Former staff member'} · {formatManilaDateTime(n.createdAt)}
                  </span>
                  <span className="whitespace-pre-wrap text-ink">{n.body}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <label htmlFor={`${id}-note`} className="sr-only">New note</label>
            <input id={`${id}-note`} type="text" maxLength={NOTE_MAX} value={body} placeholder="Add a note only staff can see" onChange={(e) => setBody(e.target.value)} className={cn(INPUT, 'h-11 min-w-0 flex-1 text-[14px]', FOCUS)} />
            <Button type="button" variant="outline" className="min-h-11 rounded-xl border-input-border px-4 text-[14px]" disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>
              Add
            </Button>
          </div>
          {add.isError && <FieldError>{(add.error as Error).message}</FieldError>}
        </div>
      )}

      {tab === 'history' && (
        <div role="tabpanel" aria-labelledby={`${id}-history`}>
          {history.isLoading && <p role="status" className="text-[14px] text-ink-muted">Loading the history…</p>}
          {history.isError && <FieldError>The history did not load: {(history.error as Error).message}</FieldError>}
          {history.data && history.data.length === 0 && <p className="text-[14px] text-ink-muted">Nothing has happened to this booking yet.</p>}
          {history.data && history.data.length > 0 && (
            <ol className="flex flex-col gap-3 border-l border-line pl-4">
              {history.data.map((entry) => {
                const { title, detail } = describeHistory(entry)
                return (
                  <li key={entry.id} className="text-[14px]">
                    <p className="font-medium text-ink">{title}</p>
                    {detail && <p className="text-ink">{detail}</p>}
                    <p className="text-[13px] text-ink-muted">
                      {entry.actor.fullName ?? 'System'} · {formatManilaDateTime(entry.createdAt)}
                    </p>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}
