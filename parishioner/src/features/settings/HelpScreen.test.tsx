import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelpScreen } from './HelpScreen'

const parish = vi.hoisted(() => ({
  value: { name: 'P', phone: '09170000000', priestName: 'F', workingHours: { start: '09:00', end: '16:00' }, officeDays: [1, 2, 3, 4, 5], email: 'office@example.org' } as Record<string, unknown>,
}))
vi.mock('../../lib/data/parish', () => ({ fetchParishInfo: vi.fn(async () => parish.value) }))

function renderHelp() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><HelpScreen /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HelpScreen office details', () => {
  it('takes hours, phone and email from the parish record', async () => {
    renderHelp()
    await userEvent.click(await screen.findByRole('button', { name: /Who can I contact/ }))
    const text = await screen.findByText(/Monday to Friday, 9:00 AM to 4:00 PM/)
    expect(text.textContent).toContain('call us at 09170000000 or email us at office@example.org')
    expect(text.textContent).not.toMatch(/8AM|5PM|stpeterapostle/)
  })

  it('leaves out an email the office has not set', async () => {
    parish.value = { ...parish.value, email: null }
    renderHelp()
    await userEvent.click(await screen.findByRole('button', { name: /Who can I contact/ }))
    await waitFor(() => expect(screen.getByText(/call us at 09170000000/).textContent).not.toMatch(/email/))
  })
})
