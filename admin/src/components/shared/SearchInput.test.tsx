import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import { SearchInput } from './SearchInput'

describe('SearchInput', () => {
  it('renders the given label as its accessible name and placeholder', () => {
    render(
      <SearchInput label="Search bookings" placeholder="Search by name, email, or ref #" value="" onChange={() => {}} />,
    )

    const input = screen.getByLabelText('Search bookings')
    expect(input).toHaveAttribute('placeholder', 'Search by name, email, or ref #')
  })

  it('calls onChange with the new value as the user types', () => {
    const onChange = vi.fn()
    render(<SearchInput label="Search users" placeholder="Search by name or email" value="" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'Juana' } })

    expect(onChange).toHaveBeenCalledWith('Juana')
  })

  it('reflects the current value passed in', () => {
    render(<SearchInput label="Search users" placeholder="placeholder" value="Pedro" onChange={() => {}} />)

    expect(screen.getByLabelText('Search users')).toHaveValue('Pedro')
  })
})
