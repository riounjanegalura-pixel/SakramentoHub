import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { AboutScreen } from './AboutScreen'
import { expectNoA11yViolations } from '../../test/a11y'
import { expectTokenOnlySource } from '../../test/tokenSource'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

describe('AboutScreen', () => {
  it('renders the app name and description', () => {
    render(
      <MemoryRouter>
        <AboutScreen />
      </MemoryRouter>,
    )
    expect(screen.getByText('SakramentoHub')).toBeInTheDocument()
    expect(screen.getByText('Track your booking requests')).toBeInTheDocument()
  })

  it('navigates back when the header back button is pressed', () => {
    mockNavigate.mockClear()
    render(
      <MemoryRouter>
        <AboutScreen />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('keeps the bottom tab bar visible so the user can jump to another section', () => {
    render(
      <MemoryRouter>
        <AboutScreen />
      </MemoryRouter>,
    )
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('has real headings, a bulleted list, a readable measure and no violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <AboutScreen />
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['SakramentoHub', 'About the app', 'What you can do'])
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(container.querySelector('.max-w-prose')).toBeTruthy()
    expectTokenOnlySource(import.meta.dirname, 'AboutScreen.tsx')
    await expectNoA11yViolations(container)
  })
})
