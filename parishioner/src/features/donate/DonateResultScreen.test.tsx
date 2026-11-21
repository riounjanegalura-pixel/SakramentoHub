import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DonateResultScreen } from './DonateResultScreen'
import { expectNoA11yViolations } from '../../test/a11y'

const renderIt = (outcome: 'thanks' | 'cancelled') =>
  render(
    <MemoryRouter>
      <DonateResultScreen outcome={outcome} />
    </MemoryRouter>,
  )

describe('DonateResultScreen', () => {
  it('thanks the donor without claiming the gift is recorded (only the server knows that)', async () => {
    const { container } = renderIt('thanks')
    expect(screen.getByRole('heading', { name: 'Thank you for your gift' })).toBeInTheDocument()
    expect(container).toHaveTextContent('GCash will confirm your payment')
    await expectNoA11yViolations(container)
  })

  it('says plainly that nothing was charged when the donor cancelled', () => {
    renderIt('cancelled')
    expect(screen.getByRole('heading', { name: 'Your gift was not made' })).toBeInTheDocument()
    expect(screen.getByText(/You were not charged/)).toBeInTheDocument()
  })
})
