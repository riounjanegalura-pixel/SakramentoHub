import '@testing-library/jest-dom'
import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AppointmentDatePicker } from '../components/shared/AppointmentDatePicker'

const fetchAvailabilityDays = vi.fn(async () => [])
vi.mock('../lib/data/availability', () => ({ fetchAvailabilityDays: (...a: unknown[]) => (fetchAvailabilityDays as (...x: unknown[]) => unknown)(...a) }))
vi.mock('../lib/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/domain')>()
  return { ...actual, parishToday: () => '2026-10-02' }
})

function Picker() {
  const [value, setValue] = useState<string | undefined>('2026-10-08')
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <span id="lbl">Date</span>
      <AppointmentDatePicker sacrament="funeral" value={value} onChange={setValue} labelId="lbl" context={{ massType: 'house' }} />
      <output data-testid="picked">{value}</output>
    </QueryClientProvider>
  )
}

const day = (root: HTMLElement, ymd: string) => root.querySelector(`[data-day="${ymd}"] button`) as HTMLButtonElement

describe('keyboard: the booking date picker', () => {
  it('moves focus with the arrow keys and picks the focused day with Enter', async () => {
    const user = userEvent.setup()
    const { container, getByTestId } = render(<Picker />)
    await waitFor(() => expect(fetchAvailabilityDays).toHaveBeenCalled())
    day(container, '2026-10-08').focus()
    await user.keyboard('{ArrowRight}')
    expect(day(container, '2026-10-09')).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(day(container, '2026-10-16')).toHaveFocus()
    await user.keyboard('{ArrowLeft}{ArrowUp}')
    expect(day(container, '2026-10-08')).toHaveFocus()
    await user.keyboard('{ArrowRight}{ArrowRight}{Enter}')
    expect(getByTestId('picked')).toHaveTextContent('2026-10-10')
  })

  it('picks the focused day with Space', async () => {
    const user = userEvent.setup()
    const { container, getByTestId } = render(<Picker />)
    await waitFor(() => expect(fetchAvailabilityDays).toHaveBeenCalled())
    day(container, '2026-10-08').focus()
    await user.keyboard('{ArrowDown} ')
    expect(getByTestId('picked')).toHaveTextContent('2026-10-15')
  })

  it('keeps a single day in the tab order so Tab leaves the grid', async () => {
    const { container } = render(<Picker />)
    await waitFor(() => expect(fetchAvailabilityDays).toHaveBeenCalled())
    const tabbable = [...container.querySelectorAll<HTMLButtonElement>('[data-day] button')].filter((b) => b.tabIndex === 0)
    expect(tabbable).toHaveLength(1)
  })
})
