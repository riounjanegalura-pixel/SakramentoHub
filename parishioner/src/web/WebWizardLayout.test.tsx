import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { WebWizardLayout } from './WebWizardLayout'
import { useBookingStore } from '../stores/booking-store'
import { setViewport } from '../test/viewport'

vi.mock('../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({ name: 'St. Peter', phone: '09123456789', priestName: 'Fr. X', workingHours: { start: '08:00', end: '17:00' } })),
}))

const STEPS = [{ title: 'Who' }, { title: 'Property' }, { title: 'Schedule' }, { title: 'Review & Submit' }]

function renderLayout(overrides: Partial<{ current: number; onJump: (n: number) => void; onBack: () => void }> = {}) {
  const props = { current: 2, onJump: vi.fn(), onBack: vi.fn(), ...overrides }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <WebWizardLayout title="House blessing · Property" steps={STEPS} current={props.current} onJump={props.onJump} onBack={props.onBack}>
          <p>Step body</p>
        </WebWizardLayout>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return props
}

describe('WebWizardLayout', () => {
  beforeEach(() => {
    setViewport(1280)
    useBookingStore.getState().reset()
  })

  it('lists every step in order and marks the current one', () => {
    renderLayout()
    const nav = screen.getByRole('navigation', { name: 'Booking steps' })
    expect(within(nav).getAllByText(/^(Who|Property|Schedule|Review & Submit)$/).map((el) => el.textContent)).toEqual(['Who', 'Property', 'Schedule', 'Review & Submit'])
    expect(within(nav).getByText('Property').closest('[aria-current="step"]')).not.toBeNull()
  })

  it('makes only earlier steps clickable and calls onJump with their number', async () => {
    const { onJump } = renderLayout({ current: 3 })
    const nav = screen.getByRole('navigation', { name: 'Booking steps' })
    expect(within(nav).queryByRole('button', { name: /Schedule/ })).toBeNull()
    await userEvent.click(within(nav).getByRole('button', { name: /Who/ }))
    expect(onJump).toHaveBeenCalledWith(1)
  })

  it('says where the answers are kept until submit', () => {
    renderLayout()
    expect(screen.getByText('Your answers are kept in this browser tab until you submit')).toBeInTheDocument()
  })

  it('calls onBack from the Back button', async () => {
    const { onBack } = renderLayout()
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('shows the step in one column with no summary panel', () => {
    renderLayout()
    expect(screen.getByText('Step body')).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).toBeNull()
    const zone = document.querySelector('[data-zone="steps"]') as HTMLElement
    expect(zone).toContainElement(screen.getByRole('navigation', { name: 'Booking steps' }))
    expect(zone).toContainElement(screen.getByText('Step body'))
  })

  it('shows the segmented progress with every step name and the moving gold segment on the current step', () => {
    renderLayout({ current: 3 })
    const nav = screen.getByRole('navigation', { name: 'Booking steps' })
    const current = within(nav).getByText('Schedule').closest('[aria-current="step"]') as HTMLElement
    expect(current).not.toBeNull()
    expect(current.querySelector('[data-progress-fill="wizard-progress"]')).not.toBeNull()
    expect(nav.querySelectorAll('[data-segment="done"]')).toHaveLength(2)
  })

  it('says the draft is saved to the account once a booking id is in the store', () => {
    useBookingStore.setState({ bookingId: 'b1' })
    renderLayout()
    expect(screen.getByText('Saved to your account')).toBeInTheDocument()
    expect(screen.queryByText('Your answers are kept in this browser tab until you submit')).not.toBeInTheDocument()
  })
})
