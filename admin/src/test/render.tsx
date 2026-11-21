import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

/** Renders `ui` inside a fresh QueryClient (no retries) and a MemoryRouter at `route`.
 * Pass `path` (e.g. '/bookings/:id') when the component reads route params. */
export function renderWithProviders(ui: ReactElement, { route = '/', path }: { route?: string; path?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const tree = path ? (
    <Routes>
      <Route path={path} element={ui} />
    </Routes>
  ) : (
    ui
  )
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{tree}</MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

/** Put next to the component under test to assert where a click navigated. */
export function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}
