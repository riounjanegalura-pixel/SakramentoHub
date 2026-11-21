import { useQuery } from '@tanstack/react-query'
import { fetchUpcomingEvents } from '../../lib/data/events'

export function useUpcomingEvents() {
  return useQuery({ queryKey: ['events', 'upcoming'], queryFn: fetchUpcomingEvents })
}
