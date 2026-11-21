import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { SelectField } from './SelectField'

describe('SelectField', () => {
  it('links the control to its error text and hides the asterisk from assistive tech', () => {
    render(<SelectField id="sex" label="Sex" required error="Select the sex" options={[{ value: 'male', label: 'Male' }]} />)
    const select = screen.getByLabelText(/^sex/i)
    expect(select).toHaveAttribute('aria-required', 'true')
    const describedBy = select.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent('Select the sex')
  })
})
