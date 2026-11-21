import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'
import { BottomNav } from './BottomNav'
import { expectNoA11yViolations } from '../../test/a11y'

const LABELS = ['Home', 'Book', 'My bookings', 'Account']

function renderNav(path = '/home') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  it('is a labelled main navigation with four links to their routes', async () => {
    const { container } = renderNav()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/home')
    expect(screen.getByRole('link', { name: 'Book' })).toHaveAttribute('href', '/services')
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/booking/history')
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/settings')
    await expectNoA11yViolations(container)
  })

  it('marks only the tab matching the route with aria-current and keeps every text label visible', () => {
    renderNav('/services')
    const current = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Book')
    for (const label of LABELS) expect(screen.getByText(label)).toBeVisible()
  })

  it('treats a nested route as its tab', () => {
    renderNav('/booking/history/abc')
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('aria-current', 'page')
  })

  it.each([
    ['/calendar', 'Home'],
    ['/events', 'Home'],
    ['/notifications', 'Home'],
    ['/wallet', 'My bookings'],
    ['/certificates/request', 'Book'],
    ['/help', 'Account'],
  ])('puts %s under the %s tab, so no page leaves the bar with nothing marked', (path, tab) => {
    renderNav(path)
    expect(screen.getByRole('link', { name: tab })).toHaveAttribute('aria-current', 'page')
  })

  it('marks the active tab with more than colour: a 3 px navy rule and bold text', () => {
    renderNav('/home')
    const home = screen.getByRole('link', { name: 'Home' })
    expect(home).toHaveClass('font-semibold', 'text-navy')
    expect(screen.getAllByTestId('tab-rule')).toHaveLength(1)
    expect(home).toContainElement(screen.getByTestId('tab-rule'))
    expect(screen.getByTestId('tab-rule')).toHaveClass('h-[3px]', 'bg-navy')
  })

  it('gives every link a 44 px minimum touch target', () => {
    renderNav()
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveClass('min-h-16')
      expect(link).toHaveClass('min-w-11')
    }
  })

  it('is a solid docked bar, full width, with the safe-area padding and no glass', () => {
    renderNav()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav).toHaveClass('fixed', 'inset-x-0', 'bottom-0', 'bg-surface', 'border-t', 'border-line')
    expect(nav.className).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(nav.className).not.toMatch(/glass|backdrop|rounded/)
  })

  it('shows the inactive labels in the muted ink, which is AA on the surface', () => {
    renderNav('/home')
    expect(screen.getByRole('link', { name: 'Book' })).toHaveClass('text-ink-muted')
  })

  it('uses no raw hex colours and no animate or transition utilities', () => {
    const { container } = renderNav()
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b|animate-|transition/)
  })
})
