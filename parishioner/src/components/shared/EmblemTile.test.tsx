import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EmblemTile } from './EmblemTile'

function renderTile(note?: string) {
  return render(
    <MemoryRouter>
      <EmblemTile to="/services/baptism" kind="baptism" name="Baptism" caption="Book at least 7 days ahead" note={note} />
    </MemoryRouter>,
  )
}

describe('EmblemTile', () => {
  it('is one link to the service page, named by the sacrament and its lead time', () => {
    renderTile()
    const link = screen.getByRole('link', { name: /Baptism/ })
    expect(link).toHaveAttribute('href', '/services/baptism')
    expect(link).toHaveTextContent('Book at least 7 days ahead')
  })

  it('shows a fee note only when it is given one', () => {
    const { unmount } = renderTile()
    expect(screen.queryByText(/Fee:/)).toBeNull()
    unmount()
    renderTile('Fee: ₱50.00 per sponsor')
    expect(screen.getByText('Fee: ₱50.00 per sponsor')).toHaveClass('tabular-nums')
  })

  it('is a paper-deep tile with the emblem on top, at least 208 px tall, with no text under 14 px', () => {
    const { container } = renderTile()
    const tile = container.querySelector('[data-slot="emblem-tile"]')!
    expect(tile).toHaveClass('bg-paper-deep', 'min-h-[208px]', 'rounded-2xl')
    expect(tile.querySelector('[data-slot="emblem"]')).toHaveAttribute('data-size', 'md')
    expect(screen.getByText('Book at least 7 days ahead')).toHaveClass('text-label')
  })
})
