import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SearchInput } from '../../components/shared/SearchInput'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { issueCertificateRequest } from '../../lib/data/certificateRequests'
import { fetchRegister } from '../../lib/data/register'
import { formatDate } from '../../lib/domain'
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue'
import type { AdminCertificateRequest, RegisterEntry } from '../../lib/types'
import { REGISTER_LABEL, SOURCE_LABEL } from '../register/registerLabels'
import { BTN_OUTLINE, BTN_PRIMARY, REG_DIALOG_NARROW } from '../register/registerForm'
import { TranscribeEntryDialog } from '../register/TranscribeEntryDialog'
import { CARD, FOCUS } from './certificateLabels'

const ROW_BTN = `inline-flex min-h-11 items-center justify-center rounded-xl border border-input-border bg-surface px-4 text-[14px] font-semibold text-navy disabled:opacity-60 ${FOCUS}`

/** Finds the request's record in the register and issues the request with the chosen entry; a record that is
 * not in the register yet can be copied from the paper book first. Issuing asks first, in a dialog. */
export function FindRecordPanel({ request, onIssued }: { request: AdminCertificateRequest; onIssued: () => void }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState(request.personName)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<RegisterEntry | null>(null)
  const [confirming, setConfirming] = useState<RegisterEntry | null>(null)
  const debouncedSearch = useDebouncedValue(search, 300)
  const register = REGISTER_LABEL[request.sacrament] ?? request.sacrament

  const matches = useQuery({
    queryKey: ['admin-register', 'for-request', request.sacrament, debouncedSearch],
    queryFn: () => fetchRegister({ sacrament: request.sacrament, status: 'valid', search: debouncedSearch, perPage: 10 }),
  })

  const issue = useMutation({
    mutationFn: (entry: RegisterEntry) => issueCertificateRequest(request.id, entry.id),
    onSuccess: () => {
      setConfirming(null)
      queryClient.invalidateQueries({ queryKey: ['admin-certificate-requests'] })
      queryClient.invalidateQueries({ queryKey: ['admin-analytics'] })
      queryClient.invalidateQueries({ queryKey: ['admin-register'] })
      onIssued()
    },
  })

  function closeConfirm() {
    setConfirming(null)
    issue.reset()
  }

  // A just-added entry goes first, and is not listed twice once the search finds it too.
  const listed = [...(added ? [added] : []), ...(matches.data?.data ?? []).filter((e) => e.id !== added?.id)]

  return (
    <section aria-label="Find the record" className={`${CARD} p-5 md:p-6`}>
      <h2 className="mb-1 font-display text-[22px] font-semibold text-navy">Find the record</h2>
      <p className="mb-4 text-[14px] leading-normal text-ink-muted">
        Search the {register} register for this person, then issue the request with the entry that matches the ID and the details above.
      </p>

      <SearchInput label="Search the register" placeholder="Search by name or register number" value={search} onChange={setSearch} />

      <div className="mt-3">
        {matches.isLoading && <p role="status" className="text-[14px] text-ink-muted">Searching…</p>}
        {matches.isError && (
          <p role="alert" className="text-[14px] text-danger">
            Couldn&apos;t search the register: {(matches.error as Error).message}{' '}
            <button type="button" onClick={() => void matches.refetch()} className={`font-semibold text-navy underline underline-offset-[3px] ${FOCUS}`}>Try again</button>
          </p>
        )}
        {listed.length > 0 && (
          <ul aria-label="Matching register entries" className="divide-y divide-line rounded-xl border border-line">
            {listed.map((entry) => (
              <li key={entry.id} aria-label={entry.registerNumber} className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-[14px]">
                <div className="min-w-0">
                  <p className="font-mono text-[13px] text-ink-muted" translate="no">{entry.registerNumber}</p>
                  <p className="break-words text-[15px] font-semibold text-ink">{entry.subjectName}</p>
                  <p className="text-[13px] text-ink-muted">{formatDate(entry.ceremonyDate)} &middot; {SOURCE_LABEL[entry.source]}</p>
                </div>
                <button
                  type="button"
                  disabled={issue.isPending}
                  aria-label={`Issue with this entry ${entry.registerNumber}`}
                  onClick={() => setConfirming(entry)}
                  className={`${ROW_BTN} max-md:w-full`}
                >
                  Issue with this entry
                </button>
              </li>
            ))}
          </ul>
        )}
        {!matches.isLoading && !matches.isError && listed.length === 0 && (
          <p className="text-[14px] text-ink-muted">No valid {register} entries match. Try another spelling, or add the entry from the paper book.</p>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <p className="mb-2 text-[13px] text-ink-muted">Not in the register yet? Copy it from the old paper book, then issue with the new entry.</p>
        <button type="button" onClick={() => setAdding(true)} className={`${ROW_BTN} max-md:w-full`}>
          Add entry
        </button>
        {adding && (
          <TranscribeEntryDialog
            initialSacrament={request.sacrament}
            initialName={request.personName}
            onClose={() => setAdding(false)}
            onCreated={(entry) => {
              setAdding(false)
              setAdded(entry)
            }}
          />
        )}
      </div>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && closeConfirm()}>
        <DialogContent className={REG_DIALOG_NARROW} aria-label="Issue this certificate">
          <div>
            <DialogTitle className="mb-1.5 font-display text-2xl font-semibold leading-tight text-navy">Issue this certificate?</DialogTitle>
            <DialogDescription className="text-[14px] leading-normal text-ink-muted">
              {request.requester.fullName} will be told their certificate is ready.
            </DialogDescription>
          </div>
          {confirming && (
            <dl className="rounded-xl border border-line bg-paper px-4">
              <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-[14px]">
                <dt className="text-ink-muted">Request</dt>
                <dd className="font-mono" translate="no">{request.referenceNumber}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-[14px]">
                <dt className="text-ink-muted">Register entry</dt>
                <dd className="font-mono" translate="no">{confirming.registerNumber}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]">
                <dt className="text-ink-muted">Name</dt>
                <dd className="min-w-0 break-words text-right font-semibold">{confirming.subjectName}</dd>
              </div>
            </dl>
          )}
          {issue.isError && <p role="alert" className="text-[14px] text-danger">{(issue.error as Error).message}</p>}
          <div className="flex flex-col-reverse gap-2.5 pt-2 md:flex-row md:justify-end">
            <button type="button" onClick={closeConfirm} className={BTN_OUTLINE}>Cancel</button>
            <button type="button" disabled={issue.isPending} onClick={() => confirming && issue.mutate(confirming)} className={BTN_PRIMARY}>Issue certificate</button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
