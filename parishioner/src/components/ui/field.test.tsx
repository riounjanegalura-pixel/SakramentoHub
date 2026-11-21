import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { Field, FieldErrorAlertContext } from './field'
import { Input } from './input'
import { Checkbox } from './checkbox'
import { RadioGroup, RadioGroupItem } from './radio-group'
import { Select, SelectTrigger } from './select'

describe('Field', () => {
  it('associates the visible label with its control', () => {
    render(
      <Field id="name" label="Full name">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('Full name')
    expect(input).toHaveAttribute('id', 'name')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('with an error sets aria-invalid and points aria-describedby at the error', () => {
    render(
      <Field
        id="email"
        label="Email"
        description="We send the receipt here."
        error="Enter an email like name@example.com."
      >
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ')
    expect(ids).toContain('email-error')
    expect(ids).toContain('email-description')
    const error = document.getElementById('email-error')
    expect(error).toHaveTextContent('Enter an email like name@example.com.')
    expect(error).toHaveAttribute('role', 'alert')
    expect(document.getElementById('email-description')).toHaveTextContent('We send the receipt here.')
  })

  it('announces its error on its own when no error summary is showing', () => {
    render(
      <Field id="plate" label="Plate" error="Enter the plate number">
        <Input />
      </Field>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the plate number')
  })

  it('leaves the announcing to an error summary when one is showing, still linked and visible', () => {
    render(
      <FieldErrorAlertContext.Provider value={false}>
        <Field id="plate" label="Plate" error="Enter the plate number">
          <Input />
        </Field>
      </FieldErrorAlertContext.Provider>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const input = screen.getByLabelText(/Plate/)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById(input.getAttribute('aria-describedby')!)).toHaveTextContent('Enter the plate number')
  })

  it('states a required field in words, not only an asterisk', () => {
    render(
      <Field id="phone" label="Phone" required>
        <Input />
      </Field>,
    )
    expect(screen.getByText('Required')).toBeInTheDocument()
    expect(screen.getByLabelText(/Phone/)).toBeRequired()
  })

  it('does not say Required for an optional field', () => {
    render(
      <Field id="note" label="Note">
        <Input />
      </Field>,
    )
    expect(screen.queryByText('Required')).not.toBeInTheDocument()
  })

  it('states an optional field in words, styled like Required, and never both', () => {
    render(
      <>
        <Field id="mid" label="Middle name" optional>
          <Input />
        </Field>
        <Field id="req" label="Phone" required optional>
          <Input />
        </Field>
      </>,
    )
    const optional = screen.getByText('Optional')
    expect(optional).toHaveClass('text-label', 'font-normal', 'text-ink-muted')
    expect(screen.getAllByText('Optional')).toHaveLength(1)
    expect(screen.getAllByText('Required')).toHaveLength(1)
    expect(screen.getByLabelText(/Middle name/)).not.toBeRequired()
  })

  it('the wrapped control draws its border from the input-border token', () => {
    render(
      <Field id="n" label="N">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('N')
    expect(input).toHaveClass('border-input-border')
    expect(input).not.toHaveClass('border-line')
  })
})

describe('control outlines and focus rings', () => {
  it('Checkbox and RadioGroupItem use input-border, the focus ring and a 44 px hit area', () => {
    render(
      <>
        <Checkbox aria-label="Agree" />
        <RadioGroup>
          <RadioGroupItem value="a" aria-label="A" />
        </RadioGroup>
      </>,
    )
    for (const el of [screen.getByRole('checkbox'), screen.getByRole('radio')]) {
      expect(el).toHaveClass(
        'border-input-border',
        'focus-visible:ring-2',
        'focus-visible:ring-focus',
        'focus-visible:ring-offset-2',
        'after:-inset-3.5',
      )
      expect(el.className).not.toMatch(/ring-ring/)
    }
  })

  it('Select trigger uses input-border and the full-strength focus ring, not ring-ring/50', () => {
    render(
      <Select>
        <SelectTrigger aria-label="Parish">x</SelectTrigger>
      </Select>,
    )
    const trigger = screen.getByRole('combobox', { name: 'Parish' })
    expect(trigger).toHaveClass('border-input-border', 'focus-visible:ring-2', 'focus-visible:ring-focus')
    expect(trigger.className).not.toMatch(/ring-ring/)
    expect(trigger.className).toMatch(/min-h-\[44px\]/)
  })
})
