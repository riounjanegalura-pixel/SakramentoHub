import { useQuery } from '@tanstack/react-query'
import { fetchParishInfo } from './data/parish'

/** The one source for the parish's name, phone and hours. */
export function useParishInfo() {
  return useQuery({ queryKey: ['parish'], queryFn: fetchParishInfo, staleTime: 5 * 60_000 })
}
