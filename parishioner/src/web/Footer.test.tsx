import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Footer } from './Footer'
import { fetchParishInfo } from '../lib/data/parish'
import { setViewport } from '../test/viewport'

vi.mock('../lib/data/parish', () => ({
  fetchParishInfo: vi.fn(async () => ({
    name: 'St. Peter the Apostle Parish',
    phone: '09123456789',
    priestName: 'Fr. X',
    workingHours: { start: '08:00', end: '17:00' },
  })),
}))

function renderFooter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Footer', () => {
  it('opens the donation card from the Support button, with no signed-in user', async () => {
    setViewport(1280)
    renderFooter()
    expect(screen.queryByRole('dialog', { name: 'Support our parish' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Support our parish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Support our parish' })
    expect(dialog).toHaveTextContent('Set an amount to give.')
  })

  it('shows the contact details it is given by the parish query, with nothing hard-coded', async () => {
    vi.mocked(fetchParishInfo).mockResolvedValueOnce({
      name: 'Holy Cross Parish',
      phone: '09998887777',
      priestName: 'Fr. Y',
      workingHours: { start: '09:30', end: '16:00' },
    })
    renderFooter()
    const footer = screen.getByRole('contentinfo')
    expect(await within(footer).findByRole('link', { name: '09998887777' })).toHaveAttribute('href', 'tel:09998887777')
    expect(footer).toHaveTextContent('Holy Cross Parish')
    expect(footer).toHaveTextContent('Office hours: 9:30 AM to 4:00 PM')
    expect(footer).not.toHaveTextContent('St. Peter')
  })

  it('renders no parish name before the data arrives', () => {
    renderFooter()
    expect(screen.getByRole('contentinfo')).not.toHaveTextContent('St. Peter')
  })
})
