import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, ClipboardList, FileText, Link2 } from 'lucide-react'
import { Disclosure } from '../../components/shared/Disclosure'
import { Reveal } from '../../components/shared/Reveal'
import { useParams } from 'react-router-dom'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { LoadError } from '../../components/shared/LoadError'
import { Skeleton } from '../../components/shared/Skeleton'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import {
  fetchRegisterCertificateHtml,
  fetchRegisterEntry,
  reinstateEntry,
  revokeEntry,
  setPaperReference,
} from '../../lib/data/register'
import { openHtmlInNewTab } from '../../lib/download'
import { formatDate, formatManilaDate, formatManilaDateTime } from '../../lib/domain'
import type { RegisterEntry, RegisterEntryDetail } from '../../lib/types'
import { useAuthStore } from '../../stores/auth-store'
import { describeHistory } from '../bookings/historyLabels'
import { CorrectEntryDialog } from './CorrectEntryDialog'
import { BTN_DANGER, BTN_OUTLINE, BTN_PRIMARY, REG_DIALOG_NARROW, REG_INPUT_SM, REG_TEXTAREA, RegField } from './registerForm'
import { groupDetails, LIMITS, RegisterStatusBadge, SOURCE_LABEL } from './registerLabels'

type Panel = 'none' | 'correct' | 'revoke' | 'reinstate'

const CARD = 'rounded-2xl border border-line bg-surface'
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
const H2 = 'font-display text-xl font-semibold text-navy'
const SMALL_BTN = `h-11 rounded-xl border border-input-border bg-surface px-4 text-[14px] font-semibold text-navy ${FOCUS} disabled:opacity-50`

function PaperReferenceCard({ entry, onSaved }: { entry: RegisterEntryDetail; onSaved: () => void }) {
  const [bookNo, setBookNo] = useState(entry.bookNo ?? '')
  const [pageNo, setPageNo] = useState(entry.pageNo ?? '')
  const [lineNo, setLineNo] = useState(entry.lineNo ?? '')
  const [saved, setSaved] = useState(false)

  const changed =
    bookNo.trim() !== (entry.bookNo ?? '') || pageNo.trim() !== (entry.pageNo ?? '') || lineNo.trim() !== (entry.lineNo ?? '')

  const save = useMutation({
    mutationFn: () =>
      setPaperReference(entry.id, { bookNo: bookNo.trim() || null, pageNo: pageNo.trim() || null, lineNo: lineNo.trim() || null }),
    onSuccess: () => {
      setSaved(true)
      onSaved()
    },
  })

  const edit = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false)
    setter(e.target.value)
  }

  return (
    <section aria-label="Paper reference" className={`${CARD} px-5 py-[18px]`}>
      <h2 className={`${H2} mb-3`}>Paper book</h2>
      <div className="grid grid-cols-3 gap-2.5">
        <RegField label="Book no." htmlFor="pr-book"><input id="pr-book" maxLength={LIMITS.paper} value={bookNo} onChange={edit(setBookNo)} className={REG_INPUT_SM} /></RegField>
        <RegField label="Page no." htmlFor="pr-page"><input id="pr-page" maxLength={LIMITS.paper} value={pageNo} onChange={edit(setPageNo)} className={REG_INPUT_SM} /></RegField>
        <RegField label="Line no." htmlFor="pr-line"><input id="pr-line" maxLength={LIMITS.paper} value={lineNo} onChange={edit(setLineNo)} className={REG_INPUT_SM} /></RegField>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" disabled={!changed || save.isPending} onClick={() => save.mutate()} className={SMALL_BTN}>
          Save paper reference
        </button>
        {saved && !changed && <p role="status" className="text-[14px] text-status-done-fg">Saved.</p>}
        {save.isError && <p role="alert" className="text-[14px] text-danger">{(save.error as Error).message}</p>}
      </div>
    </section>
  )
}

/** The booking this entry was made from: one whole card to press, saying what it is and where it goes. */
function LinkedBookingCard({ entry }: { entry: RegisterEntryDetail }) {
  return (
    <section aria-label="Linked booking">
      <Link
        to={`/bookings/${entry.bookingId}`}
        aria-label={`Open booking ${entry.bookingReference ?? entry.bookingId}`}
        className={`group flex min-h-[72px] items-center gap-3.5 rounded-2xl border border-line bg-surface px-5 py-3.5 text-ink hover:border-navy ${FOCUS}`}
      >
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-paper-deep text-navy">
          <ClipboardList size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-ink-muted">{entry.register} booking · Completed</span>
          <span className="block truncate font-mono text-[15px] font-semibold" translate="no">{entry.bookingReference ?? entry.bookingId}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-semibold text-navy">
          Open
          <ChevronRight size={18} aria-hidden="true" />
        </span>
      </Link>
    </section>
  )
}

function VerificationCard({ entry }: { entry: RegisterEntryDetail }) {
  const [copied, setCopied] = useState(false)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000) // timer: copied label reset, not animation
    } catch {
      setCopied(false)
    }
  }

  return (
    <section aria-label="Verification" className={`${CARD} px-5 py-[18px]`}>
      <h2 className={`${H2} mb-3`}>Verification</h2>
      {entry.verifiable && entry.verifyCode ? (
        <>
          <div className="flex items-center justify-between gap-2.5 rounded-xl border border-line bg-paper px-3.5 py-3">
            <span>
              <span className="block text-[13px] text-ink-muted">Code on the certificate</span>
              <code className="font-mono text-[17px] font-semibold tracking-[0.04em]" translate="no">{entry.verifyCode}</code>
            </span>
            <button type="button" onClick={() => copy(entry.verifyCode!)} className={SMALL_BTN}>Copy</button>
          </div>
          {entry.verifyUrl && (
            <button type="button" onClick={() => copy(entry.verifyUrl!)} className={`mt-2.5 flex w-full items-center justify-center gap-2 ${SMALL_BTN}`}>
              <Link2 size={16} aria-hidden="true" />
              Copy the check link
            </button>
          )}
          {copied && <p role="status" className="mt-2 text-[14px] text-status-done-fg">Copied</p>}
        </>
      ) : (
        <p className="text-[14px] text-ink-muted">Anointing records are not publicly verifiable.</p>
      )}
    </section>
  )
}

export function RegisterEntryScreen() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin'
  const [panel, setPanel] = useState<Panel>('none')
  const [reason, setReason] = useState('')
  const [certificateError, setCertificateError] = useState<string | null>(null)

  const { data: entry, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-register-entry', id],
    queryFn: () => fetchRegisterEntry(id!),
    enabled: !!id,
  })

  /** Refresh this entry, the list, and the booking it came from (its card shows the number and status). */
  function changed(updated?: RegisterEntry) {
    queryClient.invalidateQueries({ queryKey: ['admin-register-entry', id] })
    queryClient.invalidateQueries({ queryKey: ['admin-register'] })
    const bookingId = updated?.bookingId ?? entry?.bookingId
    if (bookingId) {
      queryClient.invalidateQueries({ queryKey: ['admin-booking', bookingId] })
      queryClient.invalidateQueries({ queryKey: ['admin-bookings'] })
    }
  }

  const decide = useMutation({
    mutationFn: (kind: 'revoke' | 'reinstate') => (kind === 'revoke' ? revokeEntry(id!, reason.trim()) : reinstateEntry(id!, reason.trim())),
    onSuccess: (updated) => {
      closePanel()
      changed(updated)
    },
  })

  function openPanel(next: Panel) {
    setPanel(next)
    setReason('')
    decide.reset()
  }
  function closePanel() {
    setPanel('none')
    setReason('')
  }

  async function viewCertificate() {
    setCertificateError(null)
    try {
      openHtmlInNewTab(await fetchRegisterCertificateHtml(id!))
    } catch (e) {
      setCertificateError((e as Error).message)
    }
  }

  const detailGroups = entry ? groupDetails(entry.register, entry.snapshot.details) : []
  const revoked = entry?.status === 'revoked'
  const sealColor = revoked ? 'border-danger text-danger' : 'border-gold text-gold-text'

  return (
    <AdminLayout title={entry?.subjectName ?? 'Register entry'}>
      <div className="flex w-full max-w-[1760px] flex-col gap-5">
        <Link to="/register" className={`-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start px-2 text-[14px] font-semibold text-navy ${FOCUS}`}>
          <ArrowLeft size={18} aria-hidden="true" />
          Back to Register
        </Link>

        {isLoading && (
          <div role="status" aria-busy="true" aria-label="Loading the entry" className="flex flex-col gap-5">
            <div className="flex items-end justify-between"><Skeleton className="h-10 w-44" /><Skeleton className="h-8 w-20 rounded-2xl" /></div>
            <div className="flex flex-wrap items-start gap-5">
              <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-5">
                <Skeleton className="h-44 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
              <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
                <Skeleton className="h-40 w-full rounded-2xl" />
                <Skeleton className="h-[72px] w-full rounded-2xl" />
              </div>
            </div>
          </div>
        )}
        {isError && <LoadError title="This entry didn't load" message="Check your connection, then try again." detail={(error as Error).message} onRetry={() => void refetch()} />}

        {entry && (
          <Reveal className="flex flex-col gap-5">
            <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div>
                <p className="mb-1.5 font-mono text-base font-semibold" translate="no">{entry.registerNumber}</p>
                <p className="text-[14px] text-ink-muted">{entry.register} · {SOURCE_LABEL[entry.source]}</p>
              </div>
              <RegisterStatusBadge status={entry.status} className="h-8 rounded-2xl px-3.5 text-[14px] font-semibold" />
            </header>

            <div className="flex flex-wrap items-start gap-5">
              <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-5">
                {revoked && (
                  <p role="note" className="rounded-xl bg-status-rejected-bg px-[18px] py-3.5 text-[15px] leading-normal text-status-rejected-fg">
                    <strong className="font-semibold">{entry.revokedAt ? `Withdrawn on ${formatManilaDate(entry.revokedAt)}.` : 'Withdrawn.'}</strong>{' '}
                    {entry.revokedReason ?? 'No reason recorded.'}
                  </p>
                )}

                <section aria-label="On the certificate" className={`${CARD} px-6 py-[22px]`}>
                  <div className="mb-3.5 flex items-start justify-between gap-4">
                    <h2 className={H2}>On the certificate</h2>
                    <span
                      role="img"
                      aria-label={revoked ? 'Revoked' : 'Recorded'}
                      className={`flex size-[76px] shrink-0 -rotate-[8deg] items-center justify-center rounded-full border-[3px] text-center font-display text-[13px] font-semibold leading-[1.15] ${sealColor}`}
                    >
                      {revoked ? 'Revoked' : 'Recorded'}
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
                    <Row k="Name" v={entry.subjectName} />
                    <Row k="Ceremony date" v={formatDate(entry.ceremonyDate)} />
                    <Row k="Minister" v={entry.snapshot.minister} />
                  </dl>
                  <p className="mt-4 text-[13px] text-ink-muted">
                    Entered by {entry.enteredBy?.fullName ?? 'the system'} on {formatManilaDate(entry.enteredAt)}
                    {entry.correctedAt && <> &middot; corrected on {formatManilaDate(entry.correctedAt)}</>}
                  </p>
                </section>

                {detailGroups.length > 0 && (
                  <section aria-label="Details" className="flex flex-col gap-2.5">
                    {detailGroups.map((g, i) => (
                      <Disclosure key={g.title} title={g.title} summary={g.rows.map((r) => r.value).join(' · ')} defaultOpen={i === 0}>
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                          {g.rows.map((d, j) => <Row key={`${d.label}-${j}`} k={d.label} v={d.value} />)}
                        </dl>
                      </Disclosure>
                    ))}
                  </section>
                )}

                <section aria-label="History" className={`${CARD} px-6 pb-2 pt-[18px]`}>
                  <h2 className={`${H2} mb-2`}>History</h2>
                  {entry.history.length === 0 ? (
                    <p className="pb-4 text-[14px] text-ink-muted">Nothing has happened to this entry yet.</p>
                  ) : (
                    <ul>
                      {entry.history.map((h) => {
                        const { title, detail } = describeHistory(h)
                        return (
                          <li key={h.id} className="border-t border-line py-3 text-[14px] leading-normal">
                            {title}
                            {detail && <span className="block text-ink">{detail}</span>}
                            <span className="block text-[13px] text-ink-muted">{h.actor.fullName ?? 'System'} · {formatManilaDateTime(h.createdAt)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              </div>

              <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
                <section aria-label="Actions" className={`${CARD} flex flex-col gap-2.5 px-5 py-[18px]`}>
                  {certificateError && <p role="alert" className="text-[14px] text-danger">{certificateError}</p>}
                  <button type="button" onClick={viewCertificate} className={`flex h-[52px] items-center justify-center gap-2 rounded-xl bg-navy text-base font-semibold text-white ${FOCUS}`}>
                    <FileText size={18} aria-hidden="true" />
                    View certificate
                  </button>
                  {isAdmin && entry.status === 'valid' && (
                    <>
                      <button type="button" onClick={() => openPanel('correct')} className={`${BTN_OUTLINE} h-11`}>Correct entry</button>
                      <button type="button" onClick={() => openPanel('revoke')} className={`inline-flex h-11 items-center justify-center rounded-xl border border-danger bg-surface text-[15px] font-semibold text-danger ${FOCUS}`}>
                        Revoke entry
                      </button>
                    </>
                  )}
                  {isAdmin && revoked && (
                    <button type="button" onClick={() => openPanel('reinstate')} className={`inline-flex h-11 items-center justify-center rounded-xl border border-status-done-fg bg-surface text-[15px] font-semibold text-status-done-fg ${FOCUS}`}>
                      Reinstate entry
                    </button>
                  )}
                </section>
                {entry.bookingId && <LinkedBookingCard entry={entry} />}
                <VerificationCard entry={entry} />
                <PaperReferenceCard key={`${entry.bookNo}|${entry.pageNo}|${entry.lineNo}`} entry={entry} onSaved={() => changed()} />
              </div>
            </div>

            {panel === 'correct' && (
              <CorrectEntryDialog
                entry={entry}
                onClose={closePanel}
                onSaved={(updated) => {
                  closePanel()
                  changed(updated)
                }}
              />
            )}

            <Dialog open={panel === 'revoke' || panel === 'reinstate'} onOpenChange={(open) => !open && closePanel()}>
              <DialogContent className={REG_DIALOG_NARROW} aria-label={panel === 'revoke' ? 'Revoke this entry' : 'Reinstate this entry'}>
                <div>
                  <DialogTitle className="mb-1.5 font-display text-2xl font-semibold leading-tight text-navy">
                    {panel === 'revoke' ? 'Revoke this entry?' : 'Reinstate this entry?'}
                  </DialogTitle>
                  <DialogDescription className="text-[14px] leading-normal text-ink-muted">
                    {panel === 'revoke' ? 'It still verifies, but shows REVOKED.' : 'The certificate becomes valid again and loses its REVOKED mark.'}
                  </DialogDescription>
                </div>
                <RegField label={panel === 'revoke' ? 'Reason for revoking' : 'Reason for reinstating'} htmlFor="register-reason" required>
                  <textarea
                    id="register-reason"
                    rows={4}
                    maxLength={LIMITS.reason}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={panel === 'revoke' ? 'For example: clerical error in the date of birth' : ''}
                    className={REG_TEXTAREA}
                  />
                </RegField>
                {decide.isError && <p role="alert" className="text-[14px] text-danger">{(decide.error as Error).message}</p>}
                <div className="flex flex-col-reverse gap-2.5 pt-2 md:flex-row md:justify-end">
                  <button type="button" onClick={closePanel} className={BTN_OUTLINE}>Keep entry</button>
                  {panel === 'revoke' ? (
                    <button type="button" disabled={!reason.trim() || decide.isPending} onClick={() => decide.mutate('revoke')} className={BTN_DANGER}>Revoke entry</button>
                  ) : (
                    <button type="button" disabled={!reason.trim() || decide.isPending} onClick={() => decide.mutate('reinstate')} className={BTN_PRIMARY}>Reinstate entry</button>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </Reveal>
        )}
      </div>
    </AdminLayout>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[13px] text-ink-muted">{k}</dt>
      <dd className="mt-0.5 text-[15px] font-medium">{v}</dd>
    </div>
  )
}
