import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { Emblem, type EmblemKind } from './Emblem'

const KINDS: EmblemKind[] = ['baptism', 'wedding', 'confirmation', 'funeral', 'anointing', 'house-blessing', 'certificate']

describe('Emblem', () => {
  it('has a drawing of its own for each sacrament and the certificate', () => {
    const sources = KINDS.map((kind) => {
      const { container, unmount } = render(<Emblem kind={kind} />)
      const src = container.querySelector('img')?.getAttribute('src')
      unmount()
      return src
    })
    expect(sources.every(Boolean)).toBe(true)
    expect(new Set(sources).size).toBe(KINDS.length)
  })

  it('is decorative by default, because its label sits beside it', () => {
    const { container } = render(<Emblem kind="baptism" />)
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('takes an alt when nothing sits beside it', () => {
    render(<Emblem kind="funeral" alt="Funeral" />)
    expect(screen.getByRole('img', { name: 'Funeral' })).toBeInTheDocument()
  })

  it.each([
    ['xs', ['h-[50px]', 'w-[44px]']],
    ['sm', ['h-16', 'w-14']],
    ['md', ['h-[104px]', 'w-[92px]']],
    ['lg', ['h-[148px]', 'w-[132px]']],
  ] as const)('%s niche is the arch at its own size: round top, navy outline', (size, dims) => {
    const { container } = render(<Emblem kind="wedding" size={size} />)
    const niche = container.querySelector('[data-slot="emblem"]')
    expect(niche).toHaveClass(...dims, 'rounded-t-full', 'border-navy', 'overflow-hidden')
  })

  it('defaults to the medium niche', () => {
    const { container } = render(<Emblem kind="baptism" />)
    expect(container.querySelector('[data-slot="emblem"]')).toHaveAttribute('data-size', 'md')
  })
})
