import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { RouteError } from './RouteError'

const original = window.location

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: original })
})

function mockReload() {
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } })
  return reload
}

function renderWithError(error: unknown) {
  const memory = createMemoryRouter([
    { path: '/', element: null, errorElement: <RouteError />, loader: () => { throw error } },
  ])
  vi.spyOn(console, 'error').mockImplementation(() => {})
  return render(<RouterProvider router={memory} />)
}

describe('RouteError', () => {
  it('explains a stale chunk and reloads the page on request', async () => {
    const reload = mockReload()
    renderWithError(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))
    expect(await screen.findByRole('heading', { name: 'This page could not load' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('The app was updated. Reload to get the latest version.')
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it.each([
    'Importing a module script failed.',
    'error loading dynamically imported module',
    'Failed to fetch',
  ])('shows the update text for a chunk error: %s', async (message) => {
    renderWithError(new Error(message))
    expect(await screen.findByRole('heading', { name: 'This page could not load' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('The app was updated. Reload to get the latest version.')
  })

  it('shows a generic message for any other route error', async () => {
    const reload = mockReload()
    renderWithError(new Error('Cannot read properties of undefined'))
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Reload to try again.')
    expect(screen.queryByText(/app was updated/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('uses no motion classes', async () => {
    const { container } = renderWithError(new Error('Failed to fetch'))
    await screen.findByRole('alert')
    expect(container.innerHTML).not.toMatch(/animate-|transition/)
  })

  it('is what a route shows when its chunk fails to load', async () => {
    const memory = createMemoryRouter(
      [{
        path: '/',
        errorElement: <RouteError />,
        lazy: async () => { throw new TypeError('Failed to fetch dynamically imported module: /assets/x.js') },
      }],
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<RouterProvider router={memory} />)
    expect(await screen.findByRole('heading', { name: 'This page could not load' })).toBeInTheDocument()
  })
})
