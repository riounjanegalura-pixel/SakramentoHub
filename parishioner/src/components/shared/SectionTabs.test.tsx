import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SectionTabs } from './SectionTabs'

const tabs = (second = false) => [
  { id: 'a', label: 'First', content: <input aria-label="first field" /> },
  { id: 'b', label: 'Second', hasError: second, content: <input aria-label="second field" /> },
]

describe('SectionTabs', () => {
  it('shows one tab at a time and keeps the others mounted, so their answers stay', async () => {
    render(<SectionTabs label="Sections" tabs={tabs()} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('first field'), 'Maria')
    await user.click(screen.getByRole('tab', { name: 'Second' }))
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('second field')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'First' }))
    expect(screen.getByLabelText('first field')).toHaveValue('Maria')
  })

  it('opens the tab with a problem by itself and marks it for screen readers', () => {
    const { rerender } = render(<SectionTabs label="Sections" tabs={tabs(false)} />)
    expect(screen.getByRole('tab', { name: 'First' })).toHaveAttribute('aria-selected', 'true')
    rerender(<SectionTabs label="Sections" tabs={tabs(true)} />)
    expect(screen.getByRole('tab', { name: /Second, has a problem/ })).toHaveAttribute('aria-selected', 'true')
  })
})
