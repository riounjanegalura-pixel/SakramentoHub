import { keepPreviousData, QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, gcTime: 12 * 60 * 60 * 1000, placeholderData: keepPreviousData },
  },
})
