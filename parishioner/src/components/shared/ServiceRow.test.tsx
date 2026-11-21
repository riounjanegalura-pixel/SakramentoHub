import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'
import { ServiceRow } from './ServiceRow'
import { expectNoA11yViolations } from '../../test/a11y'
import type { Service } from '../../lib/types'

const BASE: Service = {
  id: 'baptism',
  sacrament: 'baptism',
  name: 'Baptism',
  description: "Schedule your child's baptism ceremony",
  priceCentavos: 5000,
  feeRule: 'per_sponsor',
  durationMinutes: 60,
  offsite: false,
  allowedWeekdays: [2, 3, 4, 5, 6],
  leadTimeDays: 7,
  dailyCapacity: null,
  sessionWeekdays: null,
  sessionTimes: null,
  sessionCapacity: null,
}

function renderCard(over: Partial<Service> = {}) {
  return render(
    <MemoryRouter>
      <ServiceRow service={{ ...BASE, ...over }} />
    </MemoryRouter>,
  )
}

describe('ServiceRow', () => {
  it('is one link to the service page, named by sacrament, lead time and fee', async () => {
    const { container } = renderCard()
    const link = screen.getByRole('link', { name: /Baptism.*Book at least 7 days ahead.*Fee: ₱50\.00 per sponsor/ })
    expect(link).toHaveAttribute('href', '/services/baptism')
    await expectNoA11yViolations(container)
  })

  it('quotes the fee exactly as the parish does, per sponsor and never as a total, in Inter figures', () => {
    renderCard()
    const fee = screen.getByText('Fee: ₱50.00 per sponsor')
    expect(fee).toHaveClass('tabular-nums')
    expect(fee.className).not.toMatch(/font-mono/)
  })

  it('shows no fee line when the service has none', () => {
    renderCard({ id: 'confirmation', sacrament: 'confirmation', name: 'Confirmation', priceCentavos: null, feeRule: 'none' })
    expect(screen.queryByText(/Fee:/)).not.toBeInTheDocument()
    expect(screen.queryByText('No fee')).not.toBeInTheDocument()
  })

  it('can hide the fee, as the urgent rows do', () => {
    render(
      <MemoryRouter>
        <ServiceRow service={BASE} showFee={false} />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/Fee:/)).not.toBeInTheDocument()
  })

  it('says there is no minimum lead time when the lead time is zero', () => {
    renderCard({ id: 'anointing', sacrament: 'anointing', name: 'Anointing of the Sick', leadTimeDays: 0 })
    expect(screen.getByText('No minimum lead time')).toBeInTheDocument()
  })

  it("draws the sacrament's emblem in its arched niche, as a decoration beside the name", () => {
    const { container } = renderCard()
    const emblem = container.querySelector('[data-slot="emblem"]') as HTMLElement
    expect(emblem).toHaveClass('rounded-t-full', 'border-navy')
    expect(emblem.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('lets a long name wrap instead of overflowing, with no transition, animation or lift', () => {
    const { container } = renderCard({ id: 'anointing', sacrament: 'anointing', name: 'Anointing of the Sick' })
    const row = screen.getByText('Anointing of the Sick').parentElement as HTMLElement
    expect(row.className).toMatch(/overflow-wrap:anywhere/)
    expect(container.innerHTML).not.toMatch(/truncate|whitespace-nowrap|\b(animate|transition)-|shadow/)
  })

  it('is at least 72 px tall, so the whole row is an easy target', () => {
    renderCard()
    expect(screen.getByRole('link')).toHaveClass('min-h-[72px]')
  })
})
