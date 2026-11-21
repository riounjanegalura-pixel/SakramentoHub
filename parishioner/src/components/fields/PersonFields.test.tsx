import { useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useForm, type FieldValues } from 'react-hook-form'
import { parishToday } from '../../lib/domain'
import { yearsBefore } from '../../lib/validation/groups'
import { PersonFields, ageValue } from './PersonFields'

// The place-of-birth picker loads PSGC data over the network; keep tests offline.
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline')))))
afterEach(() => vi.unstubAllGlobals())

let submitted: FieldValues = {}

function Harness({ minAgeYears }: { minAgeYears?: number }) {
  const form = useForm<FieldValues>()
  return (
    <form onSubmit={form.handleSubmit((v) => { submitted = v })}>
      <PersonFields form={form} prefix="p" options={{ dob: true, age: true, minAgeYears }} />
      <button type="submit">Save</button>
    </form>
  )
}

function renderHarness(minAgeYears?: number) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness minAgeYears={minAgeYears} />
    </QueryClientProvider>,
  )
}

describe('ageValue', () => {
  it('accepts whole numbers of up to three digits', () => {
    expect(ageValue('0')).toBe(0)
    expect(ageValue(' 88 ')).toBe(88)
  })

  it.each(['', 'e', '1e2', '-5', '1.5', '1234', 'abc'])('rejects %j so the schema asks again', (raw) => {
    expect(ageValue(raw)).toBeNaN()
  })
})

function NameHarness({ defaults, error }: { defaults?: FieldValues; error?: boolean }) {
  const form = useForm<FieldValues>({ defaultValues: defaults })
  const [, setTick] = useState(0)
  return (
    <form onSubmit={form.handleSubmit((v) => { submitted = v })}>
      <PersonFields form={form} prefix="p" options={{ fixedSex: 'male' }} />
      <button type="button" onClick={() => setTick((n) => n + 1)}>Rerender</button>
      <button type="button" onClick={() => form.setError('pMiddleName', { message: 'Too long' })} disabled={!error}>Fail</button>
      <button type="submit">Save</button>
    </form>
  )
}

describe('PersonFields middle name and suffix', () => {
  it('shows the middle name as a plain optional field, not folded behind a tab', () => {
    render(<NameHarness />)
    expect(screen.queryByText(/add middle name/i)).not.toBeInTheDocument()
    expect(document.querySelector('details')).toBeNull()
    expect(screen.getByLabelText(/middle name/i)).toBeVisible()
  })

  it('submits the middle name and the suffix when they are filled', async () => {
    render(<NameHarness />)
    await userEvent.type(screen.getByLabelText(/middle name/i), 'Cruz')
    await userEvent.selectOptions(screen.getByLabelText(/suffix/i), 'Jr.')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(submitted.pMiddleName).toBe('Cruz')
    expect(submitted.pSuffix).toBe('Jr.')
  })

  it('keeps a filled middle name through a re-render', async () => {
    submitted = {}
    render(<NameHarness defaults={{ pMiddleName: 'Cruz' }} />)
    expect(screen.getByLabelText(/middle name/i)).toHaveValue('Cruz')
    await userEvent.click(screen.getByRole('button', { name: 'Rerender' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(submitted.pMiddleName).toBe('Cruz')
  })

  it('shows a server error on the middle name where it is', async () => {
    render(<NameHarness error />)
    await userEvent.click(screen.getByRole('button', { name: 'Fail' }))
    expect(screen.getByText('Too long')).toBeInTheDocument()
  })
})

describe('PersonFields suffix', () => {
  function SexHarness({ sex }: { sex?: 'male' | 'female' }) {
    const form = useForm<FieldValues>()
    return <PersonFields form={form} prefix="p" options={{ fixedSex: sex }} />
  }

  it('offers Jr., Sr., III and N/A to a man, and nothing to a woman', () => {
    const { unmount } = render(<SexHarness sex="male" />)
    expect(screen.getByLabelText(/suffix/i)).toBeVisible()
    unmount()
    render(<SexHarness sex="female" />)
    expect(screen.getByLabelText(/middle name/i)).toBeVisible()
    expect(screen.queryByLabelText(/suffix/i)).not.toBeInTheDocument()
  })
})

describe('PersonFields', () => {
  it('stops the date picker at today, or at the minimum age', () => {
    renderHarness()
    expect(screen.getByLabelText(/date of birth/i)).toHaveAttribute('max', parishToday())
  })

  it('stops the date picker at the minimum age for a wedding party', () => {
    renderHarness(18)
    expect(screen.getByLabelText(/date of birth/i)).toHaveAttribute('max', yearsBefore(parishToday(), 18))
  })

  it('takes age as typed digits, not a number spinner', async () => {
    renderHarness()
    const age = screen.getByLabelText(/^age/i)
    expect(age).not.toHaveAttribute('type', 'number')
    expect(age).toHaveAttribute('inputmode', 'numeric')
    await userEvent.type(age, '72')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(submitted.pAge).toBe(72)
  })
})
