import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RouteFallback } from './RouteFallback'

describe('RouteFallback', () => {
  it('announces loading to assistive technology', () => {
    render(<RouteFallback />)
    expect(screen.getByText('Loading')).toBeInTheDocument()
    expect(screen.getByText('Loading')).toHaveClass('sr-only')
  })

  it('marks its region busy', () => {
    const { container } = render(<RouteFallback />)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  it('uses no motion classes', () => {
    const { container } = render(<RouteFallback />)
    expect(container.innerHTML).not.toMatch(/animate-|transition/)
  })
})
