import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { PrivacyNoticeScreen } from './PrivacyNoticeScreen'
import { expectNoA11yViolations } from '../../test/a11y'
import { expectTokenOnlySource } from '../../test/tokenSource'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

describe('PrivacyNoticeScreen', () => {
  it('actually explains what data is collected and why — not a placeholder', () => {
    render(
      <MemoryRouter>
        <PrivacyNoticeScreen />
      </MemoryRouter>,
    )
    expect(screen.getByText('What we collect')).toBeInTheDocument()
    expect(screen.getByText('Your rights')).toBeInTheDocument()
    expect(screen.getByText(/Data Privacy Act of 2012/)).toBeInTheDocument()
  })

  it('links to Settings for the export/delete rights, instead of only "contact the parish office"', () => {
    render(
      <MemoryRouter>
        <PrivacyNoticeScreen />
      </MemoryRouter>,
    )
    expect(screen.getByText('Export My Data', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Delete My Account', { exact: false })).toBeInTheDocument()
    expect(screen.getAllByText('Settings').some((el) => el.closest('a')?.getAttribute('href') === '/settings')).toBe(
      true,
    )
  })

  it('navigates back when the header back button is pressed', () => {
    mockNavigate.mockClear()
    render(
      <MemoryRouter>
        <PrivacyNoticeScreen />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('keeps the bottom tab bar visible so the user can jump to another section', () => {
    render(
      <MemoryRouter>
        <PrivacyNoticeScreen />
      </MemoryRouter>,
    )
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('has real headings, a readable measure, a visible link focus, tokens only and no violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <PrivacyNoticeScreen />
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(8)
    expect(container.querySelector('.max-w-prose')).toBeTruthy()
    expectTokenOnlySource(import.meta.dirname, 'PrivacyNoticeScreen.tsx')
    await expectNoA11yViolations(container)
  })
})
