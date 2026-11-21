import { keepPreviousData, QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    // keepPreviousData: changing a filter or page keeps the old rows on screen
    // until the new ones arrive, so lists never blink back to a loading state.
    queries: { retry: 1, staleTime: 30_000, gcTime: 12 * 60 * 60 * 1000, placeholderData: keepPreviousData },
  },
})
