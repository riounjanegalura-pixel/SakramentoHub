import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/shared/AppShell'
import { AppHeader } from '../../components/shared/AppHeader'
import { ConfirmDialog } from '../../components/shared/ConfirmDialog'
import { Emblem } from '../../components/shared/Emblem'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import { fetchWallet, deleteWalletDocument } from '../../lib/data/wallet'
import { fetchDocumentFile } from '../../lib/data/documents'
import { fetchMyRegisterEntries, fetchRegisterEntryCertificateHtml } from '../../lib/data/registerEntries'
import { formatDate } from '../../lib/domain'
import type { RegisterEntrySummary, WalletDocument } from '../../lib/types'
import { AddWalletDocumentSheet } from './AddWalletDocumentSheet'
import { MyRequestsSection } from './MyRequestsSection'
import { EntryStatusPill } from './StatusPill'
import { CARD } from './cards'
import { KIND_LABEL, WALLET_LIMIT, formatAdded, messageOf, openBlob } from './walletKinds'

const CONSENT_KEY = 'sakramentohub_wallet_consent_seen'

function consentSeen(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1'
  } catch {
    return false
  }
}

function rememberConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, '1')
  } catch {
    /* storage unavailable: the line simply shows again next time */
  }
}

/** The loading state in the final shape: the same cards, drawn as blocks. */
function CardsSkeleton({ count, testId }: { count: number; testId?: string }) {
  return (
    <div>
      <p role="status" className="sr-only">Loading…</p>
      <ul data-testid={testId} aria-hidden="true" className="flex flex-col gap-3">
        {Array.from({ length: count }, (_, i) => (
          <li key={i}>
            <Skeleton className="h-28 w-full rounded-2xl" />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The error state: what happened, what to do, and the way to do it. */
function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger bg-status-rejected-bg p-4">
      <p className="min-w-0 flex-1 text-sm font-medium text-status-rejected-fg">
        Could not load your {what}. Check your connection and try again.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}

function DocumentRow({ doc }: { doc: WalletDocument }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const view = useMutation({ mutationFn: () => fetchDocumentFile(doc.fileUrl), onSuccess: openBlob })
  const remove = useMutation({
    mutationFn: () => deleteWalletDocument(doc.id),
    onSuccess: () => {
      setConfirming(false)
      void queryClient.invalidateQueries({ queryKey: ['wallet'] })
    },
  })
  const label = KIND_LABEL[doc.kind]

  return (
    <li className={CARD}>
      <h3 className="break-words font-semibold text-ink">{label}</h3>
      <p className="break-words text-sm text-ink">{doc.personName}</p>
      <p className="text-label text-ink-muted">Added {formatAdded(doc.createdAt)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" aria-label={`View ${label}`} onClick={() => view.mutate()} disabled={view.isPending}>
          View
        </Button>
        <Button type="button" variant="outline" size="sm" aria-label={`Delete ${label}`} onClick={() => setConfirming(true)} className="border-danger text-danger hover:bg-status-rejected-bg">
          Delete
        </Button>
      </div>
      {view.isError && <p role="alert" className="mt-2 text-sm font-medium text-danger">Could not open this document just now. Try again.</p>}
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open)
          if (!open) remove.reset()
        }}
        title="Delete this document?"
        description="Delete this document from your wallet? The file stays attached to any booking already using it."
      >
        {remove.isError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {messageOf(remove.error, 'Could not delete the document. Try again.')}
          </p>
        )}
        <div className="grid gap-3">
          <Button type="button" variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Delete
          </Button>
          <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      </ConfirmDialog>
    </li>
  )
}

export function DocumentsSection() {
  const wallet = useQuery({ queryKey: ['wallet'], queryFn: fetchWallet })
  const [adding, setAdding] = useState(false)
  const docs = wallet.data ?? []
  const empty = !!wallet.data && docs.length === 0

  const addButton = (
    <Button type="button" onClick={() => setAdding(true)}>
      Add a document
    </Button>
  )

  return (
    <section aria-labelledby="wallet-documents">
      <div className="mb-3 flex items-center justify-between gap-3 border-t-2 border-navy pt-3">
        <h2 id="wallet-documents" className="font-display text-heading font-semibold text-navy">My documents</h2>
        {wallet.data && <span className="tabular-nums text-sm text-ink-muted">{docs.length} of {WALLET_LIMIT}</span>}
      </div>

      {wallet.isLoading && <CardsSkeleton count={2} testId="documents-skeleton" />}
      {wallet.isError && <LoadError what="documents" onRetry={() => wallet.refetch()} />}

      {wallet.data && (
        <>
          {adding ? (
            <AddWalletDocumentSheet onClose={() => setAdding(false)} />
          ) : (
            !empty && <div className="mb-3">{addButton}</div>
          )}
          {empty && !adding && (
            <div className={`${CARD} flex flex-col items-start gap-3`}>
              <p className="font-semibold text-ink">No documents saved yet.</p>
              <p className="text-sm text-ink-muted">
                Your wallet keeps the documents a booking asks for, such as a birth or baptismal certificate. Add one
                here and reuse it the next time a booking asks for it.
              </p>
              {addButton}
            </div>
          )}
          <ul className="flex flex-col gap-3">{docs.map((d) => <DocumentRow key={d.id} doc={d} />)}</ul>
        </>
      )}
    </section>
  )
}

function CertificateRow({ entry }: { entry: RegisterEntrySummary }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const view = useMutation({
    mutationFn: () => fetchRegisterEntryCertificateHtml(entry.id),
    onSuccess: (html) => openBlob(new Blob([html], { type: 'text/html' })),
  })

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(entry.verifyUrl!)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <li className={CARD}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Emblem kind="certificate" size="xs" />
          <p className="min-w-0 text-label text-ink-muted">{entry.register}</p>
        </div>
        <EntryStatusPill revoked={entry.status === 'revoked'} />
      </div>
      <h3 className="mt-1 break-words font-semibold text-ink">{entry.subjectName}</h3>
      <p className="text-sm text-ink">{formatDate(entry.ceremonyDate)}</p>
      <p className="break-all font-mono text-sm text-ink-muted">{entry.registerNumber}</p>
      {entry.status === 'revoked' && <p className="mt-1 text-sm font-medium text-status-rejected-fg">Withdrawn by the parish office</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => view.mutate()} disabled={view.isPending}>
          View
        </Button>
        {entry.verifyUrl && (
          <Button type="button" variant="ghost" size="sm" onClick={copyLink}>
            Verification link
          </Button>
        )}
      </div>
      {view.isError && <p role="alert" className="mt-2 text-sm font-medium text-danger">Could not open this certificate just now. Try again.</p>}
      {copyState === 'copied' && <p className="mt-2 text-sm font-medium text-status-done-fg" role="status">Link copied</p>}
      {copyState === 'failed' && (
        <p className="mt-2 break-all font-mono text-sm text-ink" role="status">{entry.verifyUrl}</p>
      )}
    </li>
  )
}

export function CertificatesSection() {
  const entries = useQuery({ queryKey: ['register-entries'], queryFn: fetchMyRegisterEntries })
  return (
    <section aria-labelledby="wallet-certificates">
      <h2 id="wallet-certificates" className="mb-3 border-t-2 border-navy pt-3 font-display text-heading font-semibold text-navy">My certificates</h2>
      {entries.isLoading && <CardsSkeleton count={1} />}
      {entries.isError && <LoadError what="certificates" onRetry={() => entries.refetch()} />}
      {entries.data && entries.data.length === 0 && (
        <p className={`${CARD} text-sm text-ink-muted`}>
          Your certificates appear here after a sacrament is completed.
        </p>
      )}
      <ul className="flex flex-col gap-3">{entries.data?.map((e) => <CertificateRow key={e.id} entry={e} />)}</ul>
    </section>
  )
}

/** The one-time note about how documents are kept; the same on the phone and the desktop Documents page. */
export function WalletConsentNote() {
  const [showConsent, setShowConsent] = useState(() => !consentSeen())
  if (!showConsent) return null
  return (
    <div className="rounded-2xl border border-line bg-paper p-4 text-sm text-ink">
      <p>
        Documents you add here are kept so you can reuse them in bookings. Only you can open them, and the parish
        office when you attach one to a booking. You can delete a document at any time.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => {
          rememberConsent()
          setShowConsent(false)
        }}
      >
        Got it
      </Button>
    </div>
  )
}

export function WalletScreen() {
  const navigate = useNavigate()

  return (
    <AppShell header={<AppHeader title="My wallet" onBack={() => navigate(-1)} />}>
      <div className="flex flex-col gap-8 px-4 py-4">
        <WalletConsentNote />
        <DocumentsSection />
        <CertificatesSection />
        <MyRequestsSection />
      </div>
    </AppShell>
  )
}
