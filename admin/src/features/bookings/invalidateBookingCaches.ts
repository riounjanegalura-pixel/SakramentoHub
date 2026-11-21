import type { QueryClient } from '@tanstack/react-query'

/** Everything a booking change can make stale: the booking, the queue, the register, the history, the schedule and the reports. */
export function invalidateBookingCaches(queryClient: QueryClient, id: string | undefined) {
  queryClient.invalidateQueries({ queryKey: ['admin-booking', id] })
  queryClient.invalidateQueries({ queryKey: ['admin-booking-by-reference'] })
  queryClient.invalidateQueries({ queryKey: ['admin-bookings'] })
  queryClient.invalidateQueries({ queryKey: ['admin-register'] }) // completing makes the entry
  queryClient.invalidateQueries({ queryKey: ['admin-register-entry'] })
  queryClient.invalidateQueries({ queryKey: ['admin-booking-history', id] })
  queryClient.invalidateQueries({ queryKey: ['admin-schedule'] })
  queryClient.invalidateQueries({ queryKey: ['admin-analytics'] })
  queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('admin-report') })
}
