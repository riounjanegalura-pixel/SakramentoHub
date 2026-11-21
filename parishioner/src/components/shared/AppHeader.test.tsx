import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import { AppHeader } from './AppHeader'
import { expectNoA11yViolations } from '../../test/a11y'

describe('AppHeader', () => {
  it('shows the page title as the level-one heading in the display face', async () => {
    const { container } = render(<AppHeader title="Services" subtitle="Pick one" />)
    const h1 = screen.getByRole('heading', { level: 1, name: 'Services' })
    expect(h1).toHaveClass('font-display')
    expect(screen.getByText('Pick one')).toBeInTheDocument()
    await expectNoA11yViolations(container)
  })

  it('renders the action slot and the back button', async () => {
    const onBack = vi.fn()
    const { container } = render(
      <AppHeader title="Profile" onBack={onBack} action={<button>Edit</button>} />,
    )
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    await expectNoA11yViolations(container)
  })

  it('is solid paper: no glass, no blur, and it does not stick', () => {
    render(<AppHeader title="Home" />)
    const header = screen.getByRole('banner')
    expect(header).toHaveClass('bg-paper')
    expect(header.className).not.toMatch(/glass|backdrop|sticky|text-white/)
  })

  it('a page with a back button keeps a hairline under its header; an entry page has none', () => {
    const { rerender } = render(<AppHeader title="Home" />)
    expect(screen.getByRole('banner')).not.toHaveClass('border-b')
    rerender(<AppHeader title="Profile" onBack={() => {}} />)
    expect(screen.getByRole('banner')).toHaveClass('border-b', 'border-line')
  })

  it('writes the title in navy so it reads on the paper ground', () => {
    render(<AppHeader title="Home" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-navy')
  })

  it('draws no gold brand tile: gold is for the seal, the emblems and one hairline', () => {
    render(<AppHeader title="Home" />)
    expect(screen.queryByTestId('brand-mark')).toBeNull()
    expect(screen.getByRole('banner').innerHTML).not.toMatch(/bg-gold/)
  })

  it('an entry page sets its title in the large entry size', () => {
    render(<AppHeader title="My bookings" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-display-xl')
  })
})
