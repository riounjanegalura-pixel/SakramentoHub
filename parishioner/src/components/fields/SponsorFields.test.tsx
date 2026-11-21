import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useForm, type FieldValues } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { SponsorFields } from './SponsorFields'

// The residence picker loads PSGC data over the network; keep tests offline
// (it falls back to a free-text input, which is all these tests need).
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline')))))
afterEach(() => vi.unstubAllGlobals())

function Harness({ min, max }: { min: number; max: number }) {
  const form = useForm<FieldValues>({ defaultValues: { sponsors: [] as unknown[] } })
  return <SponsorFields form={form} min={min} max={max} minAge={16} />
}

function renderHarness(min: number, max: number) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness min={min} max={max} />
    </QueryClientProvider>,
  )
}

describe('SponsorFields', () => {
  it('starts with the minimum number of sponsor cards and can add up to the max', async () => {
    renderHarness(1, 2)
    expect(screen.getAllByRole('group', { name: /sponsor \d/i })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /add sponsor/i }))
    expect(screen.getAllByRole('group', { name: /sponsor \d/i })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /add sponsor/i })).not.toBeInTheDocument()
  })

  it('cannot remove below the minimum', () => {
    renderHarness(1, 3)
    expect(screen.queryByRole('button', { name: /remove sponsor 1/i })).not.toBeInTheDocument()
  })

  it('shows the same fields on every sponsor card', async () => {
    renderHarness(1, 2)
    await userEvent.click(screen.getByRole('button', { name: /add sponsor/i }))
    for (const label of [/first name/i, /last name/i, /age/i, /religion/i]) {
      expect(screen.getAllByLabelText(label)).toHaveLength(2)
    }
  })

  it('shows a rule about the whole list (e.g. sponsors in pairs) once the sponsor fields are registered', async () => {
    // With registered sponsors.N fields, the resolver files a list-level issue under `sponsors.root`.
    const schema = z.looseObject({ sponsors: z.array(z.looseObject({ firstName: z.string() })) }).superRefine((d, ctx) => {
      if (d.sponsors.length % 2 !== 0) ctx.addIssue({ code: 'custom', path: ['sponsors'], message: 'Principal sponsors must be in pairs.' })
    })
    function Paired() {
      const form = useForm<FieldValues>({ resolver: zodResolver(schema) as never, defaultValues: { sponsors: [{ firstName: 'A' }] } })
      return (
        <form onSubmit={form.handleSubmit(() => {})}>
          <SponsorFields form={form} min={1} max={4} minAge={18} />
          <button type="submit">Continue</button>
        </form>
      )
    }
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Paired />
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Principal sponsors must be in pairs.')).toBeInTheDocument()
  })
})
