import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import * as m from 'motion/react-m'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { DataTable, createDataTableColumns } from '../../components/shared/DataTable'
import { ClampedText } from '../../components/shared/ClampedText'
import { LoadError } from '../../components/shared/LoadError'
import { Pagination } from '../../components/shared/Pagination'
import { Reveal } from '../../components/shared/Reveal'
import { Skeleton } from '../../components/shared/Skeleton'
import { UnderlineTabs } from '../../components/shared/UnderlineTabs'
import { useIsPhone } from '../../lib/hooks/useIsPhone'
import { SearchInput } from '../../components/shared/SearchInput'
import { fetchCertificateRequests } from '../../lib/data/certificateRequests'
import { formatManilaDate } from '../../lib/domain'
import { durations, ease, staggerDelay } from '../../lib/motion'
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue'
import type { AdminCertificateRequest, CertificateRequestStatus } from '../../lib/types'
import { REGISTER_LABEL } from '../register/registerLabels'
import { FOCUS, RequestStatusBadge } from './certificateLabels'

const NO_REQUESTS: AdminCertificateRequest[] = []

/** The reference is the row's link: it is the row's keyboard handle (Enter opens the request). */
const REQUEST_COLUMNS = createDataTableColumns<AdminCertificateRequest>((col) => [
  col.accessor('referenceNumber', {
    header: 'Reference',
    cell: ({ row }) => (
      <Link
        to={`/certificate-requests/${row.original.id}`}
        className="font-mono text-label text-ink-muted underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus inline-flex min-h-11 items-center lg:min-h-8"
      >
        {row.original.referenceNumber}
      </Link>
    ),
  }),
  col.accessor((r) => REGISTER_LABEL[r.sacrament] ?? r.sacrament, {
    id: 'certificate',
    header: 'Certificate',
    cell: ({ row }) => <span className="text-ink">{REGISTER_LABEL[row.original.sacrament] ?? row.original.sacrament}</span>,
  }),
  col.accessor('personName', { header: 'Name on record', cell: ({ row }) => <ClampedText className="font-medium text-ink">{row.original.personName}</ClampedText> }),
  col.accessor((r) => r.requester.fullName, { id: 'requester', header: 'Requester', cell: ({ row }) => <ClampedText className="text-ink">{row.original.requester.fullName}</ClampedText> }),
  col.accessor('createdAt', { header: 'Submitted', cell: ({ row }) => <span className="text-ink-muted">{formatManilaDate(row.original.createdAt)}</span> }),
  col.accessor('status', { header: 'Status', cell: ({ row }) => <RequestStatusBadge status={row.original.status} /> }),
])

type Filter = CertificateRequestStatus | 'all'

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: 'submitted', label: 'Waiting' },
  { value: 'issued', label: 'Issued' },
  { value: 'declined', label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
]

/** No `status` in the address means the open requests, which is what the office opens this screen for. */
function filterFromUrl(value: string | null): Filter {
  const found = FILTER_OPTIONS.find((o) => o.value === value)
  return found ? found.value : 'submitted'
}

/** Requests for a copy of a past record, waiting ones first. */
export function CertificateRequestsScreen() {
  const navigate = useNavigate()
  const phone = useIsPhone()
  // Like the bookings queue, the filter lives in the address so a view can be linked and survives opening a request.
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = filterFromUrl(searchParams.get('status'))
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search, 300)
  const status: CertificateRequestStatus | '' = filter === 'all' ? '' : filter

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-certificate-requests', status, debouncedSearch, page],
    queryFn: () => fetchCertificateRequests({ status, search: debouncedSearch, page, perPage: 10 }),
  })

  function chooseFilter(value: Filter) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (value === 'submitted') params.delete('status')
        else params.set('status', value)
        return params
      },
      { replace: true },
    )
    setPage(1)
  }

  const requests = data?.data ?? NO_REQUESTS
  const meta = data?.meta
  const term = debouncedSearch.trim()
  const emptyText = term
    ? `No certificate requests match "${term}".`
    : filter === 'submitted'
      ? 'No requests waiting'
      : 'No certificate requests match this filter.'

  return (
    <AdminLayout title="Certificate requests">
      <div className="flex w-full max-w-[1760px] flex-col gap-4">
        <div className="z-10 flex flex-wrap items-center gap-x-2.5 gap-y-3 bg-paper md:sticky md:top-[66px]">
          <UnderlineTabs
            label="Filter by status"
            value={filter}
            onChange={chooseFilter}
            className="min-w-0 flex-[1_1_100%]"
            tabs={FILTER_OPTIONS.map((o) => ({ ...o, count: o.value === filter && meta ? meta.total : undefined }))}
          />
          <div className="min-w-0 flex-[1_1_280px] md:max-w-[380px]">
            <SearchInput
              label="Search requests"
              placeholder="Search by reference or name"
              value={search}
              onChange={(v) => {
                setSearch(v)
                setPage(1)
              }}
            />
          </div>
        </div>

        {isError && (
          <Reveal>
            <LoadError title="Requests didn't load" message="Check your connection, then try again." detail={(error as Error).message} onRetry={() => void refetch()} />
          </Reveal>
        )}

        {!isError && isLoading && phone && (
          <div role="status" aria-busy="true" aria-label="Loading certificate requests" className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-4 py-3.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        )}

        {!isError && !isLoading && requests.length === 0 && (
          <Reveal>
            <section className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
              {!term && filter === 'submitted' && (
                <div role="img" aria-label="Done" className="flex size-12 items-center justify-center rounded-full bg-status-done-bg text-status-done-fg">
                  <Check size={24} aria-hidden="true" />
                </div>
              )}
              <p className="text-[17px] font-semibold">{emptyText}</p>
              {term && (
                <button type="button" onClick={() => setSearch('')} className={`mt-2 h-11 rounded-xl border border-input-border bg-surface px-5 text-[14px] font-semibold text-navy ${FOCUS}`}>
                  Clear search
                </button>
              )}
            </section>
          </Reveal>
        )}

        {!isError && !phone && (isLoading || requests.length > 0) && (
          <DataTable
            caption="Certificate requests"
            columns={REQUEST_COLUMNS}
            data={requests}
            getRowId={(request) => request.id}
            isLoading={isLoading}
            serverPagination={data ? { meta: data.meta, onPageChange: setPage } : undefined}
            onRowClick={(request) => navigate(`/certificate-requests/${request.id}`)}
          />
        )}

        {!isError && phone && requests.length > 0 && (
          <>
            <ul aria-label="Certificate requests" className="flex flex-col gap-3">
              {requests.map((r, i) => (
                <m.li key={r.id} initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: durations.base, ease: [...ease], delay: staggerDelay(i) }}>
                  <Link to={`/certificate-requests/${r.id}`} className={`block min-h-11 rounded-2xl border border-line bg-surface px-4 py-3.5 text-ink ${FOCUS}`}>
                    <span className="flex items-start justify-between gap-2.5">
                      <span className="min-w-0">
                        <span className="block break-words text-[16px] font-semibold">{r.personName}</span>
                        <span className="mt-0.5 block text-[13px] text-ink-muted">{REGISTER_LABEL[r.sacrament] ?? r.sacrament} certificate</span>
                      </span>
                      <RequestStatusBadge status={r.status} />
                    </span>
                    <span className="mt-2 block break-words text-[13px] text-ink-muted">Requested by {r.requester.fullName}</span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-[13px] tabular-nums text-ink-muted">
                      <span className="font-mono">{r.referenceNumber}</span>
                      <span>{formatManilaDate(r.createdAt)}</span>
                    </span>
                  </Link>
                </m.li>
              ))}
            </ul>
            {meta && <Pagination meta={meta} onPageChange={setPage} />}
          </>
        )}
      </div>
    </AdminLayout>
  )
}
