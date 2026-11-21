import { useQuery } from '@tanstack/react-query'
import type { Paginated } from '../types'

/**
 * Shows 10 rows a page on top of a server that pages by some other size (15 users, 20 log entries).
 * Fetches the one or two server pages that cover the 10 asked for. Previous data is kept while the next page loads.
 */
export function useTenPerPage<T>({
  queryKey,
  page,
  serverSize,
  fetchPage,
  size = 10,
}: {
  queryKey: readonly unknown[]
  page: number
  serverSize: number
  fetchPage: (serverPage: number) => Promise<Paginated<T>>
  size?: number
}) {
  return useQuery({
    queryKey: [...queryKey, page],
    queryFn: async () => {
      const start = (page - 1) * size
      let per = serverSize
      let first = Math.floor(start / per) + 1
      let a = await fetchPage(first)
      if (a.meta.per_page && a.meta.per_page !== per) {
        per = a.meta.per_page
        const corrected = Math.floor(start / per) + 1
        if (corrected !== first) {
          first = corrected
          a = await fetchPage(first)
        }
      }
      let all = a.data
      const lastServerPage = Math.floor((start + size - 1) / per) + 1
      if (lastServerPage > first && lastServerPage <= a.meta.last_page) all = all.concat((await fetchPage(first + 1)).data)
      const offset = start - (first - 1) * per
      const total = a.meta.total
      return { rows: all.slice(offset, offset + size), total, pageCount: Math.max(1, Math.ceil(total / size)) }
    },
  })
}
