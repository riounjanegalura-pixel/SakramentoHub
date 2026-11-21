import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from './components/ui/sonner'
import { router } from './routes'
import { queryClient } from './lib/query-client'
import { PERSIST_MAX_AGE, queryPersister } from './lib/query-persist'
import { useAuthBootstrap } from './hooks/useAuthBootstrap'

export default function App() {
  useAuthBootstrap()

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: PERSIST_MAX_AGE,
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' },
      }}
    >
      <RouterProvider router={router} />
      <Toaster />
    </PersistQueryClientProvider>
  )
}
