import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import { HelpScreen } from './HelpScreen'
import { expectNoA11yViolations } from '../../test/a11y'
import { expectTokenOnlySource } from '../../test/tokenSource'

const mockNavigate = vi.fn()

vi.mock('../../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

describe('HelpScreen', () => {
  it('accordion trigger exposes aria-expanded', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <HelpScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const trigger = screen.getByRole('button', { name: /How do I book a sacrament/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('expands an answer on click and collapses the previously open one', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <HelpScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByText('How do I book a sacrament?'))
    expect(screen.getByText(/Open Book/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('How do I download my certificates?'))
    expect(screen.queryByText(/Open Book/)).not.toBeInTheDocument()
    expect(screen.getByText(/Documents and certificates/)).toBeInTheDocument()
  })

  it('navigates back when the header back button is pressed', () => {
    mockNavigate.mockClear()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <HelpScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('keeps the bottom tab bar visible so the user can jump to another section', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <HelpScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('has a heading over the questions, a readable measure, tokens only and no violations', async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <HelpScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Frequently asked questions' })).toBeInTheDocument()
    expect(container.querySelector('.max-w-prose')).toBeTruthy()
    expectTokenOnlySource(import.meta.dirname, 'HelpScreen.tsx')
    await expectNoA11yViolations(container)
    await userEvent.click(screen.getByRole('button', { name: /How do I book a sacrament/i }))
    await expectNoA11yViolations(container)
  })

  it('every question is a 44 px target', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <HelpScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    for (const b of screen.getAllByRole('button', { expanded: false })) expect(b.className).toMatch(/min-h-(11|\[44px\])/)
  })
})

describe('HelpScreen parish facts', () => {
  it('quotes the parish phone from the parish record, with no number typed into the page', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <HelpScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByTestId('emergency-call')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Who can I contact/i }))
    expect(await screen.findByText(/call us at 09123456789/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/9482734769/)
  })
})
