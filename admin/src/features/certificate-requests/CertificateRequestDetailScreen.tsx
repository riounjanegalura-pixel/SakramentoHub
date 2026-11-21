import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { Reveal } from '../../components/shared/Reveal'
import { LoadError } from '../../components/shared/LoadError'
import { Skeleton } from '../../components/shared/Skeleton'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { declineCertificateRequest, fetchCertificateRequest } from '../../lib/data/certificateRequests'
import { formatManilaDate, formatManilaDateTime24 } from '../../lib/domain'
import { useAuthenticatedBlobUrl } from '../../lib/hooks/useAuthenticatedBlobUrl'
import type { AdminCertificateRequest } from '../../lib/types'
import { AuthenticatedFileLink } from '../bookings/AuthenticatedFileLink'
import { BTN_DANGER, BTN_OUTLINE, REG_DIALOG_NARROW, REG_TEXTAREA, RegField } from '../register/registerForm'
import { LIMITS, REGISTER_LABEL } from '../register/registerLabels'
import { CARD, FOCUS, INVALID_ID_REMARK, RELATIONSHIP_LABEL, RequestStatusBadge } from './certificateLabels'
import { FindRecordPanel } from './FindRecordPanel'

const QUICK_REMARKS = [
  { label: 'Wrong or unclear ID: use the standard message', text: INVALID_ID_REMARK },
  { label: 'ID does not match the name', text: 'The name on the ID does not match the name on the request. Please send an ID that matches, or tell us how the names are related.' },
  { label: 'No record found', text: 'We could not find a record under that name and date. Please check the details and send a new request.' },
]

const H2 = 'font-display text-[22px] font-semibold text-navy'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-[15px] text-ink">{children}</dd>
    </div>
  )
}

/** The ID shown on the page, so the office can compare it with the details without opening another tab. */
function IdPreview({ path, name }: { path: string; name: string }) {
  const { blobUrl, isLoading, error } = useAuthenticatedBlobUrl(path)
  if (isLoading) return <p role="status" className="rounded-xl bg-paper-deep px-4 py-8 text-center text-[14px] text-ink-muted">Loading the ID…</p>
  if (error || !blobUrl) return null
  return (
    <img
      src={blobUrl}
      alt={`ID submitted by ${name}`}
      onError={(e) => { e.currentTarget.style.display = 'none' }}
      className="max-h-96 w-full rounded-xl border border-line bg-paper-deep object-contain sm:w-auto"
    />
  )
}

/** Returning or declining asks for remarks, in a dialog (a bottom sheet on a phone). */
function DeclineDialog({ request, onClose, onDeclined }: { request: AdminCertificateRequest; onClose: () => void; onDeclined: () => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState(false)

  const decline = useMutation({
    mutationFn: () => declineCertificateRequest(request.id, reason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-certificate-requests'] })
      queryClient.invalidateQueries({ queryKey: ['admin-analytics'] })
      onDeclined()
      onClose()
    },
  })

  function submit() {
    if (!reason.trim()) {
      setMissing(true)
      return
    }
    decline.mutate()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={REG_DIALOG_NARROW} aria-label="Return or decline this request">
        <div>
          <DialogTitle className="mb-1.5 font-display text-2xl font-semibold leading-tight text-navy">Return or decline this request</DialogTitle>
          <DialogDescription className="text-[14px] leading-normal text-ink-muted">
            The requester is told the reason, so say what they can do next.
          </DialogDescription>
        </div>
        <div role="group" aria-label="Suggested remarks" className="flex flex-wrap gap-2">
          {QUICK_REMARKS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => {
                setReason(r.text)
                setMissing(false)
              }}
              className={`min-h-11 rounded-xl border border-input-border bg-surface px-3.5 text-left text-[14px] font-semibold text-navy ${FOCUS}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <RegField label="Remarks" htmlFor="decline-reason" required error={missing ? 'Give a reason.' : undefined}>
          <textarea
            id="decline-reason"
            rows={4}
            maxLength={LIMITS.reason}
            value={reason}
            aria-invalid={missing || undefined}
            onChange={(e) => {
              setReason(e.target.value)
              setMissing(false)
            }}
            className={REG_TEXTAREA}
          />
        </RegField>
        {decline.isError && <p role="alert" className="text-[14px] text-danger">{(decline.error as Error).message}</p>}
        <div className="flex flex-col-reverse gap-2.5 pt-2 md:flex-row md:justify-end">
          <button type="button" onClick={onClose} className={BTN_OUTLINE}>Keep request</button>
          <button type="button" disabled={decline.isPending} onClick={submit} className={BTN_DANGER}>Send back to the requester</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CertificateRequestDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [declining, setDeclining] = useState(false)

  const { data: request, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-certificate-request', id],
    queryFn: () => fetchCertificateRequest(id!),
    enabled: !!id,
  })

  /** After issue or decline: show the result here, and refresh the lists that count this request. */
  function closed() {
    queryClient.invalidateQueries({ queryKey: ['admin-certificate-request', id] })
    queryClient.invalidateQueries({ queryKey: ['admin-certificate-requests'] })
    queryClient.invalidateQueries({ queryKey: ['admin-analytics'] })
    queryClient.invalidateQueries({ queryKey: ['admin-register'] })
  }

  return (
    <AdminLayout title="Certificate request">
      <div className="flex w-full max-w-[1760px] flex-col gap-5">
        <Link to="/certificate-requests" className={`-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start px-2 text-[14px] font-semibold text-navy ${FOCUS}`}>
          <ArrowLeft size={18} aria-hidden="true" />
          Back to Certificate requests
        </Link>

        {isLoading && (
          <div role="status" aria-busy="true" aria-label="Loading the request" className="flex flex-col gap-5">
            <div className="flex items-end justify-between"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24 rounded-full" /></div>
            <div className="flex flex-wrap gap-5"><Skeleton className="h-72 min-w-0 flex-[3_1_480px]" /><Skeleton className="h-72 min-w-0 flex-[2_1_320px]" /></div>
          </div>
        )}
        {isError && <LoadError title="This request didn't load" message="Check your connection, then try again." detail={`Couldn't load this request: ${(error as Error).message}`} onRetry={() => void refetch()} />}

        {request && (
          <Reveal className="flex flex-col gap-5">
            <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div>
                <p className="mb-1.5 font-mono text-base font-semibold" translate="no">{request.referenceNumber}</p>
                <p className="text-[14px] text-ink-muted">Submitted {formatManilaDateTime24(request.createdAt)}</p>
              </div>
              <RequestStatusBadge status={request.status} className="h-8 rounded-2xl px-3.5 text-[14px] font-semibold" />
            </header>

            {request.status === 'declined' && request.declineReason && (
              <p role="note" className="rounded-xl bg-status-rejected-bg px-[18px] py-3.5 text-[15px] leading-normal text-status-rejected-fg">
                <strong className="font-semibold">Declined{request.closedAt ? ` on ${formatManilaDate(request.closedAt)}` : ''}.</strong> {request.declineReason}
              </p>
            )}

            <div className="flex flex-wrap items-start gap-5">
              <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-5">
                <section aria-label="Request" className={`${CARD} px-6 py-[22px]`}>
                  <h2 className={`${H2} mb-3.5`}>The record asked for</h2>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Row label="Certificate">{REGISTER_LABEL[request.sacrament] ?? request.sacrament}</Row>
                    {request.details.registerNumber && <Row label="Register number given"><span className="font-mono">{request.details.registerNumber}</span></Row>}
                    <Row label="Name on the record"><span className="font-semibold">{request.personName}</span></Row>
                    <Row label="Date of the ceremony, as given">{request.sacramentDateText}</Row>
                    {request.details.fatherName && <Row label="Father">{request.details.fatherName}</Row>}
                    {request.details.motherName && <Row label="Mother">{request.details.motherName}</Row>}
                    {request.details.spouseName && <Row label="Spouse">{request.details.spouseName}</Row>}
                    <Row label="Requested by">{RELATIONSHIP_LABEL[request.relationship]}</Row>
                    <Row label="Purpose">{request.purpose}</Row>
                    {request.handledBy && <Row label="Handled by">{request.handledBy.fullName}</Row>}
                    {request.closedAt && <Row label="Closed">{formatManilaDate(request.closedAt)}</Row>}
                    {request.registerEntry && (
                      <Row label="Issued with">
                        <Link to={`/register/${request.registerEntry.id}`} className={`font-mono font-medium text-navy underline underline-offset-[3px] ${FOCUS}`}>
                          {request.registerEntry.registerNumber}
                        </Link>
                      </Row>
                    )}
                  </dl>
                </section>

                {request.status === 'submitted' && <FindRecordPanel request={request} onIssued={closed} />}
              </div>

              <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
                <section aria-label="Requester" className={`${CARD} px-5 py-[18px]`}>
                  <h2 className={`${H2} mb-3`}>Requester</h2>
                  <dl className="flex flex-col gap-3">
                    <Row label="Name">{request.requester.fullName}</Row>
                    <Row label="Email">{request.requester.email ?? '—'}</Row>
                    <Row label="Phone">{request.requester.phone ?? '—'}</Row>
                  </dl>
                  <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-line pt-3 text-[14px]">
                    {request.filesRemovedAt ? (
                      <p className="text-ink-muted">Files removed on {formatManilaDate(request.filesRemovedAt)}</p>
                    ) : (
                      <>
                        {request.idUrl && <AuthenticatedFileLink path={request.idUrl} label="View ID" />}
                        {request.letterUrl && <AuthenticatedFileLink path={request.letterUrl} label="View letter" />}
                      </>
                    )}
                  </div>
                  {request.idUrl && !request.filesRemovedAt && (
                    <div className="mt-3">
                      <IdPreview path={request.idUrl} name={request.requester.fullName} />
                    </div>
                  )}
                  {request.status === 'submitted' && (
                    <p className="mt-3 text-[13px] leading-normal text-ink-muted">Compare the ID above with the name and details before you issue a copy. If it is wrong, send it back with remarks below.</p>
                  )}
                </section>

                {request.status === 'submitted' && (
                  <section aria-label="Actions" className={`${CARD} flex flex-col gap-2.5 px-5 py-[18px]`}>
                    <button
                      type="button"
                      onClick={() => setDeclining(true)}
                      className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-danger bg-surface px-4 text-[15px] font-semibold text-danger ${FOCUS}`}
                    >
                      Return / decline with remarks
                    </button>
                  </section>
                )}
              </div>
            </div>

            {declining && <DeclineDialog request={request} onClose={() => setDeclining(false)} onDeclined={closed} />}
          </Reveal>
        )}
      </div>
    </AdminLayout>
  )
}
