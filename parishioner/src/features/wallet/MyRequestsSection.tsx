import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import { cancelCertificateRequest, fetchMyCertificateRequests } from '../../lib/data/certificateRequests'
import { fetchRegisterEntryCertificateHtml } from '../../lib/data/registerEntries'
import type { CertificateRequest } from '../../lib/types'
import { CERTIFICATE_LABEL } from '../certificates/certificateKinds'
import { RequestStatusPill } from './StatusPill'
import { CARD } from './cards'
import { formatAdded, messageOf, openBlob } from './walletKinds'

function RequestRow({ request }: { request: CertificateRequest }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const label = CERTIFICATE_LABEL[request.sacrament]

  const view = useMutation({
    mutationFn: () => fetchRegisterEntryCertificateHtml(request.registerEntry!.id),
    onSuccess: (html) => openBlob(new Blob([html], { type: 'text/html' })),
  })
  const cancel = useMutation({
    mutationFn: () => cancelCertificateRequest(request.id),
    onSuccess: () => {
      setConfirming(false)
      return queryClient.invalidateQueries({ queryKey: ['certificate-requests'] })
    },
  })

  return (
    <li className={CARD}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-all font-mono text-label text-ink-muted">{request.referenceNumber}</p>
        <RequestStatusPill status={request.status} />
      </div>
      <h3 className="mt-1 break-words font-semibold text-ink">{label}</h3>
      <p className="break-words text-sm text-ink">{request.personName}</p>
      <p className="text-label text-ink-muted">Sent {formatAdded(request.createdAt)}</p>

      {request.status === 'submitted' && <p className="mt-1 text-sm text-ink-muted">Awaiting the parish office.</p>}
      {request.status === 'issued' && request.registerEntry && (
        <>
          <p className="mt-1 font-mono text-sm text-ink">{request.registerEntry.registerNumber}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => view.mutate()} disabled={view.isPending}>
            View certificate
          </Button>
          {view.isError && <p role="alert" className="mt-2 text-sm font-medium text-danger">Could not open this certificate just now. Try again.</p>}
        </>
      )}
      {request.status === 'declined' && (
        <p className="mt-1 text-sm text-ink">Reason from the parish office: {request.declineReason}</p>
      )}
      {request.status === 'submitted' && (
        <Button type="button" variant="ghost" size="sm" className="mt-3 text-danger hover:bg-status-rejected-bg" onClick={() => setConfirming(true)}>
          Cancel request
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open)
          if (!open) cancel.reset()
        }}
        title="Cancel this request?"
        description="Cancel this request? The parish office will not look for the record."
      >
        {cancel.isError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {messageOf(cancel.error, 'Could not cancel the request. Try again.')}
          </p>
        )}
        <div className="grid gap-3">
          <Button type="button" variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Yes, cancel it
          </Button>
          <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      </ConfirmDialog>
    </li>
  )
}

/** "My requests": certificate copy requests, newest first, with the way to make a new one. */
export function MyRequestsSection() {
  const location = useLocation()
  const submittedReference = (location.state as { submittedReference?: string } | null)?.submittedReference
  const requests = useQuery({ queryKey: ['certificate-requests'], queryFn: fetchMyCertificateRequests })

  return (
    <section aria-labelledby="wallet-requests">
      <h2 id="wallet-requests" className="mb-3 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">My requests</h2>
      {submittedReference && (
        <p role="status" className="mb-3 rounded-xl bg-status-done-bg p-3 text-sm font-medium text-status-done-fg">
          Your request was sent. Your reference is <span className="font-mono">{submittedReference}</span>.
        </p>
      )}
      <Button asChild variant="outline" className="mb-3 w-full">
        <Link to="/certificates/request">Request a certificate copy</Link>
      </Button>
      {requests.isLoading && (
        <div>
          <p role="status" className="sr-only">Loading…</p>
          <Skeleton aria-hidden="true" className="h-28 w-full rounded-2xl" />
        </div>
      )}
      {requests.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger bg-status-rejected-bg p-4">
          <p className="min-w-0 flex-1 text-sm font-medium text-status-rejected-fg">
            Could not load your requests. Check your connection and try again.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => requests.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {requests.data && requests.data.length === 0 && (
        <p className={`${CARD} text-sm text-ink-muted`}>You have no certificate requests.</p>
      )}
      <ul className="flex flex-col gap-3">{requests.data?.map((r) => <RequestRow key={r.id} request={r} />)}</ul>
    </section>
  )
}
