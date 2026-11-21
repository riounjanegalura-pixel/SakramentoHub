import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight, Plus, Search } from 'lucide-react'
import * as m from 'motion/react-m'
import { AdminLayout } from '../../components/shared/AdminLayout'
import { LoadError } from '../../components/shared/LoadError'
import { Reveal } from '../../components/shared/Reveal'
import { Skeleton } from '../../components/shared/Skeleton'
import { fetchRegister } from '../../lib/data/register'
import { formatDate } from '../../lib/domain'
import { durations, ease, staggerDelay } from '../../lib/motion'
import { useIsPhone } from '../../lib/hooks/useIsPhone'
import { useDebouncedValue } from '../../lib/hooks/useDebouncedValue'
import type { RegisterEntry, RegisterSource, RegisterStatus } from '../../lib/types'
import { REGISTER_LABEL, REGISTER_OPTIONS, RegisterStatusBadge, SOURCE_LABEL } from './registerLabels'
import { TranscribeEntryDialog } from './TranscribeEntryDialog'

const NO_ENTRIES: RegisterEntry[] = []
const STATUS_OPTIONS: RegisterStatus[] = ['valid', 'revoked']
const SOURCE_OPTIONS: RegisterSource[] = ['system', 'transcribed']
const FILTER_KEYS = ['sacrament', 'status', 'source']
const YEAR = /^\d{4}$/
const PER_PAGE = 10

/** Rows lift in 30 ms apart; only the first eight are staggered. */
const rowMotion = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: durations.base, ease: [...ease] as [number, number, number, number], delay: staggerDelay(i) } },
})

/** A URL value restricted to a known list; anything else counts as "no filter". */
function oneOf<T extends string>(value: string | null, options: readonly T[]): T | '' {
  return options.includes(value as T) ? (value as T) : ''
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
/** Filters look like the page's other buttons: 44 px, 12 px radius, a 2 px navy ring while one is applied. */
const filterClass = (on: boolean) =>
  `min-h-11 rounded-xl bg-surface px-3.5 text-[14px] font-medium text-navy ${on ? 'border-2 border-navy' : 'border border-input-border'} ${FOCUS}`
const ROW_GRID = 'grid grid-cols-[170px_minmax(220px,2fr)_150px_110px_28px] gap-4'

/** The parish register: every completed booking and every entry copied from the paper books. */
export function RegisterScreen() {
  const navigate = useNavigate()
  const phone = useIsPhone()
  // Like the bookings queue, the filters live in the address so a view can be linked and survives opening an entry.
  const [searchParams, setSearchParams] = useSearchParams()
  const sacrament = oneOf(searchParams.get('sacrament'), REGISTER_OPTIONS)
  const status = oneOf(searchParams.get('status'), STATUS_OPTIONS)
  const source = oneOf(searchParams.get('source'), SOURCE_OPTIONS)
  const [yearText, setYearText] = useState('')
  // Only a full four-digit year is sent, so typing "19" never asks the server for year 19.
  const year = YEAR.test(yearText.trim()) ? yearText.trim() : ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const debouncedSearch = useDebouncedValue(search, 300)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-register', sacrament, year, status, source, debouncedSearch, page],
    queryFn: () => fetchRegister({ sacrament, year, status, source, search: debouncedSearch, page, perPage: PER_PAGE }),
  })

  function setParam(key: string, value: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (value) params.set(key, value)
        else params.delete(key)
        return params
      },
      { replace: true },
    )
    setPage(1)
  }

  function clearFilters() {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        FILTER_KEYS.forEach((k) => params.delete(k))
        return params
      },
      { replace: true },
    )
    setYearText('')
    setPage(1)
  }

  const anyFilter = [sacrament, status, source, year].some(Boolean)
  const entries = data?.data ?? NO_ENTRIES
  const meta = data?.meta

  const addButton = (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className={`inline-flex h-12 items-center gap-2 rounded-xl bg-navy px-[18px] text-[15px] font-semibold text-white max-md:w-full max-md:justify-center md:ml-auto md:h-11 ${FOCUS}`}
    >
      <Plus size={18} aria-hidden="true" />
      Add entry
    </button>
  )

  return (
    <AdminLayout title="Register">
      {adding && (
        <TranscribeEntryDialog
          onClose={() => setAdding(false)}
          onCreated={(entry) => {
            setAdding(false)
            navigate(`/register/${entry.id}`)
          }}
        />
      )}

      <div className="flex w-full max-w-[1760px] flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-0 flex-[1_1_280px] md:max-w-[380px]">
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 text-ink-muted" />
            <input
              type="search"
              aria-label="Search the register"
              placeholder="Name or register number"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className={`h-12 w-full rounded-xl border border-input-border bg-surface pl-[42px] pr-3 text-[15px] placeholder:text-ink-muted md:h-11 ${FOCUS}`}
            />
          </div>

          <select aria-label="Filter by register" value={sacrament} onChange={(e) => setParam('sacrament', e.target.value)} className={filterClass(!!sacrament)}>
            <option value="">Register</option>
            {REGISTER_OPTIONS.map((s) => <option key={s} value={s}>{REGISTER_LABEL[s]}</option>)}
          </select>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            aria-label="Filter by year"
            placeholder="Year"
            value={yearText}
            onChange={(e) => {
              setYearText(e.target.value)
              setPage(1)
            }}
            className={`${filterClass(!!year)} w-24 placeholder:text-navy`}
          />
          <select aria-label="Filter by source" value={source} onChange={(e) => setParam('source', e.target.value)} className={filterClass(!!source)}>
            <option value="">Source</option>
            {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
          <select aria-label="Filter by status" value={status} onChange={(e) => setParam('status', e.target.value)} className={filterClass(!!status)}>
            <option value="">Status</option>
            <option value="valid">Valid</option>
            <option value="revoked">Revoked</option>
          </select>

          {anyFilter && (
            <button type="button" onClick={clearFilters} className={`min-h-11 px-2 text-[14px] font-semibold text-navy underline underline-offset-[3px] ${FOCUS}`}>
              Clear filters
            </button>
          )}
          {addButton}
        </div>

        {isLoading && (
          <div role="status" aria-busy="true" aria-label="Loading the register" className="overflow-hidden rounded-2xl border border-line bg-surface">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`${phone ? 'flex-col' : ROW_GRID} flex min-h-16 items-center gap-3 border-b border-line px-6 py-2.5 last:border-b-0 max-md:items-start`}>
                <Skeleton className="h-4 w-28" />
                <div className="flex w-full flex-col gap-1.5"><Skeleton className="h-4 w-48 max-w-full" /><Skeleton className="h-3 w-32" /></div>
                {!phone && <><Skeleton className="h-4 w-24" /><Skeleton className="h-6 w-16 rounded-full" /></>}
              </div>
            ))}
          </div>
        )}

        {isError && <LoadError title="The register didn't load" message="Check your connection, then try again." detail={(error as Error).message} onRetry={() => void refetch()} />}

        {!isLoading && !isError && entries.length === 0 && (
          <Reveal className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-6 py-12 text-center">
            <p className="mb-2 text-[17px] font-semibold">
              {debouncedSearch.trim() ? `No register entries match "${debouncedSearch.trim()}".` : 'No register entries match these filters.'}
            </p>
            {(anyFilter || debouncedSearch.trim()) && (
              <button
                type="button"
                onClick={() => {
                  clearFilters()
                  setSearch('')
                }}
                className={`h-11 rounded-xl border border-input-border bg-surface px-5 text-[14px] font-semibold text-navy ${FOCUS}`}
              >
                Clear filters
              </button>
            )}
          </Reveal>
        )}

        {entries.length > 0 && (
          <section aria-label="Register entries" className="overflow-hidden rounded-2xl border border-line bg-surface">
            {!phone && (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className={`${ROW_GRID} border-b border-line px-6 py-3 text-[13px] font-semibold text-ink-muted`}>
                  <span>Number</span><span>Name</span><span>Ceremony</span><span>Status</span><span />
                </div>
                <ul>
                  {entries.map((e, i) => (
                    <m.li key={e.id} {...rowMotion(i)} className="border-b border-line last:border-b-0">
                      <Link to={`/register/${e.id}`} aria-label={e.registerNumber} className={`${ROW_GRID} min-h-16 items-center px-6 py-2.5 text-ink hover:bg-line/30 ${FOCUS}`}>
                        <span className="font-mono text-[14px] font-semibold" translate="no">{e.registerNumber}</span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold">{e.subjectName}</span>
                          <span className="mt-0.5 block text-[13px] text-ink-muted">{e.register} · {SOURCE_LABEL[e.source]}</span>
                        </span>
                        <span className="text-[14px] tabular-nums">{formatDate(e.ceremonyDate)}</span>
                        <span><RegisterStatusBadge status={e.status} /></span>
                        <ChevronRight size={18} aria-hidden="true" className="text-ink-muted" />
                      </Link>
                    </m.li>
                  ))}
                </ul>
              </div>
            </div>
            )}

            {phone && (
            <ul className="flex flex-col gap-3 bg-paper p-0">
              {entries.map((e, i) => (
                <m.li key={e.id} {...rowMotion(i)}>
                  <Link to={`/register/${e.id}`} aria-label={e.registerNumber} className={`block rounded-2xl border border-line bg-surface px-4 py-3.5 text-ink ${FOCUS}`}>
                    <span className="flex items-start justify-between gap-2.5">
                      <span className="min-w-0">
                        <span className="block font-mono text-[14px] font-semibold" translate="no">{e.registerNumber}</span>
                        <span className="mt-1 block text-[16px] font-semibold">{e.subjectName}</span>
                      </span>
                      <RegisterStatusBadge status={e.status} />
                    </span>
                    <span className="mt-2 flex justify-between gap-2 text-[13px] text-ink-muted">
                      <span>{e.register} · {SOURCE_LABEL[e.source]}</span>
                      <span className="tabular-nums">{formatDate(e.ceremonyDate)}</span>
                    </span>
                  </Link>
                </m.li>
              ))}
            </ul>
            )}

            {meta && meta.last_page > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-3">
                <span role="status" className="text-[14px] text-ink-muted">Page {meta.current_page} of {meta.last_page} · {meta.total} entries</span>
                <div className="flex gap-2">
                  <button type="button" aria-label="Previous page" disabled={meta.current_page <= 1} onClick={() => setPage(meta.current_page - 1)} className={`h-11 rounded-[10px] border border-input-border bg-surface px-4 text-[14px] font-semibold text-navy disabled:opacity-60 ${FOCUS}`}>
                    Previous
                  </button>
                  <button type="button" aria-label="Next page" disabled={meta.current_page >= meta.last_page} onClick={() => setPage(meta.current_page + 1)} className={`h-11 rounded-[10px] border border-input-border bg-surface px-4 text-[14px] font-semibold text-navy disabled:opacity-60 ${FOCUS}`}>
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </AdminLayout>
  )
}
