import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import * as m from 'motion/react-m'
import { useReducedMotion } from 'motion/react'
import { ArrowDown, ArrowUp, ArrowUpDown, Rows3, Rows4 } from 'lucide-react'
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnHelper,
  type RowData,
} from '@tanstack/react-table'
import { Pagination } from './Pagination'
import { Skeleton } from './Skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '../../lib/utils'
import { durations, ease, staggerDelay } from '../../lib/motion'
import type { PaginatedMeta } from '../../lib/types'

/**
 * TanStack Table v9 registers each feature explicitly: sorting (with the three
 * string/date comparators the "auto" sort can pick) and client pagination. The
 * core row model is automatic in v9; there is no getCoreRowModel any more.
 */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

export type DataTableFeatures = typeof dataTableFeatures
// `any`: each column keeps its own value type; the array is heterogeneous.
export type DataTableColumn<T extends RowData> = ColumnDef<DataTableFeatures, T, any>

/** Builds a typed column list with v9's column helper (`col.accessor`, `col.display`). */
export function createDataTableColumns<T extends RowData>(
  build: (col: ColumnHelper<DataTableFeatures, T>) => DataTableColumn<T>[],
): DataTableColumn<T>[] {
  return build(createColumnHelper<DataTableFeatures, T>())
}

export type Density = 'comfortable' | 'compact'

export type DataTableProps<T extends RowData> = {
  columns: DataTableColumn<T>[]
  data: T[]
  /** Names the table for screen readers; rendered as a visually hidden caption. */
  caption: string
  /** Client pagination page size. Ignored when `serverPagination` is given. */
  pageSize?: number
  density?: Density
  onRowClick?: (row: T) => void
  isLoading?: boolean
  emptyState?: ReactNode
  error?: { message: string; onRetry: () => void }
  /** The rows are one page from the server: render them all, page with the server's meta. */
  serverPagination?: { meta: PaginatedMeta; onPageChange: (page: number) => void }
  getRowId?: (row: T) => string
}

const EMPTY: never[] = []
const LOADING_ROWS = 6
const INTERACTIVE = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"]'

/**
 * v9 sorts `undefined` last with `sortUndefined: 'last'` but treats `null` as a
 * value. API rows use `null` for "none", so every accessor reports null as
 * undefined: missing values then sort last in both directions.
 */
function normaliseColumn<T extends RowData>(def: DataTableColumn<T>): DataTableColumn<T> {
  const d = def as DataTableColumn<T> & { accessorKey?: string; accessorFn?: (row: T, index: number) => unknown }
  if (typeof d.accessorFn === 'function') {
    const read = d.accessorFn
    return { sortUndefined: 'last', ...d, accessorFn: (row: T, i: number) => read(row, i) ?? undefined } as DataTableColumn<T>
  }
  if (typeof d.accessorKey === 'string') {
    const path = d.accessorKey.split('.')
    const { accessorKey, ...rest } = d
    return {
      sortUndefined: 'last',
      ...rest,
      id: d.id ?? accessorKey,
      accessorFn: (row: T) => path.reduce<unknown>((v, k) => (v == null ? undefined : (v as Record<string, unknown>)[k]), row) ?? undefined,
    } as DataTableColumn<T>
  }
  return def
}

/** The first link or button in a row's first cell: the row's keyboard handle. */
function primaryControl(row: HTMLElement | null): HTMLElement | null {
  return row?.querySelector<HTMLElement>('td:first-child a[href], td:first-child button') ?? null
}

export function DataTable<T extends RowData>({
  columns,
  data,
  caption,
  pageSize = 25,
  density: initialDensity = 'comfortable',
  onRowClick,
  isLoading = false,
  emptyState,
  error,
  serverPagination,
  getRowId,
}: DataTableProps<T>) {
  const reduced = useReducedMotion()
  const [density, setDensity] = useState<Density>(initialDensity)
  const normalised = useMemo(() => columns.map(normaliseColumn), [columns])
  const server = !!serverPagination

  const table = useTable({
    features: dataTableFeatures,
    columns: normalised,
    data: isLoading ? (EMPTY as T[]) : data,
    getRowId: getRowId ? (row: T) => getRowId(row) : undefined,
    initialState: { pagination: { pageIndex: 0, pageSize } },
    // Sorting is always on the rows we hold: for a server page, that page only.
    manualPagination: server,
    // Ascending first for every column, then descending, then unsorted (v9 would start numbers descending).
    sortDescFirst: false,
    enableMultiSort: false,
  })

  const leafCount = table.getAllLeafColumns().length
  const rows = table.getRowModel().rows
  const sorted = table.state.sorting.length > 0
  const compact = density === 'compact'
  const cellPad = compact ? 'px-4 py-1.5' : 'px-4 py-3'

  const meta: PaginatedMeta = serverPagination?.meta ?? {
    current_page: table.state.pagination.pageIndex + 1,
    last_page: Math.max(table.getPageCount(), 1),
    per_page: pageSize,
    total: table.getRowCount(),
  }
  const onPageChange = serverPagination?.onPageChange ?? ((page: number) => table.setPageIndex(page - 1))

  if (error) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6">
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
        <p className="mt-1 text-sm text-ink-muted">Check your connection and try again.</p>
        <Button type="button" size="sm" className="mt-4" onClick={error.onRetry}>
          Try again
        </Button>
      </div>
    )
  }

  function handleRowClick(e: MouseEvent<HTMLTableRowElement>, row: T) {
    if (!onRowClick) return
    const control = (e.target as HTMLElement).closest(INTERACTIVE)
    // A link, button or field inside the row does its own job.
    if (control && e.currentTarget.contains(control)) return
    onRowClick(row)
  }

  function handleRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, row: T) {
    const handle = primaryControl(e.currentTarget)
    if (e.target !== handle) return
    if (e.key === 'Enter' && onRowClick && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault()
      onRowClick(row)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const sibling = e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling
      const next = primaryControl(sibling as HTMLElement | null)
      if (next) {
        e.preventDefault()
        next.focus()
      }
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-1.5">
        <p className="text-label text-ink-muted">{server && sorted && meta.last_page > 1 ? 'Sorted within this page.' : null}</p>
        <button
          type="button"
          aria-pressed={compact}
          onClick={() => setDensity(compact ? 'comfortable' : 'compact')}
          className="flex min-h-11 lg:min-h-8 max-sm:hidden items-center gap-1.5 rounded-lg px-2 text-label font-medium text-ink-muted hover:bg-paper hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {compact ? <Rows4 size={14} aria-hidden="true" /> : <Rows3 size={14} aria-hidden="true" />}
          Compact rows
        </button>
      </div>

      {isLoading && (
        <p className="sr-only" role="status">
          Loading
        </p>
      )}

      {/* The scroll box gives the sticky header something to stick to. */}
      <div className="max-h-[70vh] overflow-auto">
        <table aria-busy={isLoading || undefined} data-density={density} className="w-full border-collapse text-left text-sm max-sm:block">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-paper max-sm:sr-only">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b-2 border-navy">
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const dir = header.column.getIsSorted()
                  const ariaSort = !canSort ? undefined : dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'
                  const label = header.isPlaceholder ? null : <table.FlexRender header={header} />
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      colSpan={header.colSpan}
                      aria-sort={ariaSort}
                      className={cn('h-auto whitespace-nowrap text-label font-semibold text-ink-muted', canSort ? 'px-2 py-1.5' : 'px-4 py-3')}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={() => header.column.toggleSorting()}
                          className={cn(
                            'inline-flex min-h-11 lg:min-h-8 items-center gap-1.5 rounded-lg px-2 hover:bg-line/50 hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                            dir && 'text-navy',
                          )}
                        >
                          {label}
                          {dir === 'asc' ? (
                            <ArrowUp size={14} aria-hidden="true" />
                          ) : dir === 'desc' ? (
                            <ArrowDown size={14} aria-hidden="true" />
                          ) : (
                            <ArrowUpDown size={14} aria-hidden="true" className="opacity-50" />
                          )}
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="max-sm:block">
            {isLoading &&
              Array.from({ length: LOADING_ROWS }).map((_, r) => (
                <tr key={`skeleton-${r}`} className="border-b border-line last:border-0 max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:px-3 max-sm:py-3">
                  {Array.from({ length: leafCount }).map((__, c) => (
                    <td key={c} className={cn(cellPad, 'max-sm:block max-sm:px-0 max-sm:py-1')}>
                      <Skeleton className={cn('h-4', c === 0 ? 'w-28' : 'w-full max-w-40')} />
                    </td>
                  ))}
                </tr>
              ))}

            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={leafCount} className="px-4 py-6 text-sm text-ink-muted max-sm:block">
                  {emptyState ?? 'Nothing to show here yet.'}
                </td>
              </tr>
            )}

            {!isLoading &&
              rows.map((row, index) => (
                <m.tr
                  key={row.id}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: durations.base, ease: [...ease], delay: staggerDelay(index) }}
                  onClick={(e: MouseEvent<HTMLTableRowElement>) => handleRowClick(e, row.original)}
                  onKeyDown={(e: KeyboardEvent<HTMLTableRowElement>) => handleRowKeyDown(e, row.original)}
                  className={cn(
                    'border-b border-line last:border-0 hover:bg-paper has-[:focus-visible]:bg-paper max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:px-3 max-sm:py-3',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {row.getAllCells().map((cell, ci) => (
                    <td
                      key={cell.id}
                      data-label={typeof cell.column.columnDef.header === 'string' && ci > 0 ? cell.column.columnDef.header : undefined}
                      className={cn('align-middle', cellPad, 'max-sm:block max-sm:min-w-0 max-sm:px-0 max-sm:py-1 max-sm:[overflow-wrap:anywhere] max-sm:first:col-span-2 max-sm:before:block max-sm:before:text-label max-sm:before:text-ink-muted max-sm:before:content-[attr(data-label)]')}
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </m.tr>
              ))}
          </tbody>
        </table>
      </div>

      {!isLoading && <Pagination meta={meta} onPageChange={onPageChange} />}
    </div>
  )
}
