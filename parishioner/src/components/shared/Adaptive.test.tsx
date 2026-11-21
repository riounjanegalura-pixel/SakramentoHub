import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { Adaptive } from './Adaptive'
import { setViewport } from '../../test/viewport'

const original = window.matchMedia
afterEach(() => {
  window.matchMedia = original
})

const shell = (children: React.ReactNode) => <div data-testid="shell">{children}</div>

describe('Adaptive', () => {
  it('shows the mobile screen under 1024 px, with no shell', () => {
    setViewport(390)
    render(<Adaptive mobile={<p>mobile</p>} desktop={<p>desktop</p>} shell={shell} />)
    expect(screen.getByText('mobile')).toBeInTheDocument()
    expect(screen.queryByText('desktop')).not.toBeInTheDocument()
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument()
  })

  it('shows the desktop screen at 1280 px', () => {
    setViewport(1280)
    render(<Adaptive mobile={<p>mobile</p>} desktop={<p>desktop</p>} shell={shell} />)
    expect(screen.getByText('desktop')).toBeInTheDocument()
    expect(screen.queryByText('mobile')).not.toBeInTheDocument()
  })

  it('falls back to the mobile screen inside the shell when there is no desktop version', () => {
    setViewport(1280)
    render(<Adaptive mobile={<p>mobile</p>} shell={shell} />)
    expect(screen.getByTestId('shell')).toContainElement(screen.getByText('mobile'))
  })

  it('shows the desktop node alone at 1280 px when there is a desktop page and no shell', () => {
    setViewport(1280)
    render(<Adaptive mobile={<p>mobile</p>} desktop={<p>desktop</p>} />)
    expect(screen.getByText('desktop')).toBeInTheDocument()
    expect(screen.queryByText('mobile')).not.toBeInTheDocument()
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument()
  })

  it('shows the mobile screen alone when there is neither desktop nor shell', () => {
    setViewport(1280)
    render(<Adaptive mobile={<p>mobile</p>} />)
    expect(screen.getByText('mobile')).toBeInTheDocument()
  })
})
