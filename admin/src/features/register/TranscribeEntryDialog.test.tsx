import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TranscribeEntryDialog } from './TranscribeEntryDialog'
import * as registerData from '../../lib/data/register'
import * as settingsData from '../../lib/data/settings'
import { ApiError } from '../../lib/api/client'
import { renderWithProviders } from '../../test/render'
import { registerEntry } from '../../test/factories'
import type { AdminSettings } from '../../lib/types'

const labels = () => screen.getAllByLabelText(/^Detail label \d+$/).map((el) => (el as HTMLInputElement).value)

function renderDialog(onCreated = vi.fn(), onClose = vi.fn()) {
  renderWithProviders(<TranscribeEntryDialog onClose={onClose} onCreated={onCreated} />)
  return { onCreated, onClose }
}

async function fillRequired({ book = '4', page = '12' }: { book?: string; page?: string } = {}) {
  await userEvent.type(screen.getByLabelText(/^Name/), 'Pedro Santos')
  fireEvent.change(screen.getByLabelText(/^Ceremony date/), { target: { value: '1998-05-02' } })
  await userEvent.clear(screen.getByLabelText(/^Minister/))
  await userEvent.type(screen.getByLabelText(/^Minister/), 'Fr. Old')
  if (book) await userEvent.type(screen.getByLabelText(/^Book no\./), book)
  if (page) await userEvent.type(screen.getByLabelText(/^Page no\./), page)
}

describe('TranscribeEntryDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(settingsData, 'fetchSettings').mockResolvedValue({ parish: { priestName: 'Rev. Fr. Leopoldo' } } as AdminSettings)
  })

  it('starts the detail rows from the chosen register and swaps them when the register changes', async () => {
    renderDialog()
    expect(labels()).toEqual(['Date of birth', 'Place of birth', 'Father', 'Mother', 'Sponsors'])

    await userEvent.selectOptions(screen.getByLabelText(/^Register/), 'confirmation')
    expect(labels()).toEqual(['Date of birth', 'Father', 'Mother', 'Sponsor'])
    await userEvent.selectOptions(screen.getByLabelText(/^Register/), 'wedding')
    expect(labels()).toEqual(['Groom', 'Bride', 'Witnesses'])
    await userEvent.selectOptions(screen.getByLabelText(/^Register/), 'funeral')
    expect(labels()).toEqual(['Date of death', 'Age', 'Place of burial'])
  })

  it('starts from the given register and name when asked to, with that register rows', async () => {
    renderWithProviders(<TranscribeEntryDialog onClose={vi.fn()} onCreated={vi.fn()} initialSacrament="wedding" initialName="Ana Reyes" />)
    expect(screen.getByLabelText(/^Register/)).toHaveValue('wedding')
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Ana Reyes')
    expect(labels()).toEqual(['Groom', 'Bride', 'Witnesses'])
  })

  it('starts empty on the baptism register when given nothing (the Register screen)', () => {
    renderDialog()
    expect(screen.getByLabelText(/^Register/)).toHaveValue('baptism')
    expect(screen.getByLabelText(/^Name/)).toHaveValue('')
  })

  it('lets rows be removed and added; changing the register starts that register\'s rows afresh', async () => {
    renderDialog()
    await userEvent.type(screen.getByLabelText('Detail value 3'), 'Jose Santos') // Father
    await userEvent.selectOptions(screen.getByLabelText(/^Register/), 'confirmation')
    expect(screen.getByLabelText('Detail value 3')).toHaveValue('')
    expect(labels()).toEqual(['Date of birth', 'Father', 'Mother', 'Sponsor'])

    await userEvent.click(screen.getByRole('button', { name: 'Remove detail 1' }))
    expect(labels()).toEqual(['Father', 'Mother', 'Sponsor'])
    await userEvent.click(screen.getByRole('button', { name: 'Add a detail' }))
    expect(labels()).toEqual(['Father', 'Mother', 'Sponsor', ''])
  })

  it('starts the minister empty and fills it from Use Fr. on request', async () => {
    renderDialog()
    expect(screen.getByLabelText(/^Minister/)).toHaveValue('')
    await userEvent.click(await screen.findByRole('button', { name: 'Use Rev. Fr. Leopoldo' }))
    expect(screen.getByLabelText(/^Minister/)).toHaveValue('Rev. Fr. Leopoldo')
  })

  it('has no Use button while the settings are loading', async () => {
    vi.spyOn(settingsData, 'fetchSettings').mockImplementation(() => new Promise(() => {}))
    renderDialog()
    expect(screen.queryByRole('button', { name: /^Use / })).not.toBeInTheDocument()
  })

  it('needs the book and page before it sends anything', async () => {
    const spy = vi.spyOn(registerData, 'transcribeEntry')
    renderDialog()
    await fillRequired({ book: '', page: '' })
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))
    expect(await screen.findByText('Enter the book number.')).toBeInTheDocument()
    expect(screen.getByText('Enter the page number.')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('sends the entry with filled details only and no line number', async () => {
    const spy = vi.spyOn(registerData, 'transcribeEntry').mockResolvedValue(registerEntry({ id: 'r5' }))
    const { onCreated } = renderDialog()
    await fillRequired()
    await userEvent.type(screen.getByLabelText('Detail value 3'), '  Jose Santos ')
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        sacrament: 'baptism', ceremonyDate: '1998-05-02', subjectName: 'Pedro Santos', minister: 'Fr. Old',
        details: [{ label: 'Father', value: 'Jose Santos' }], bookNo: '4', pageNo: '12',
      }),
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'r5' })))
  })

  it('counts the book and page on by itself and shows today as the issue date, with no line number', async () => {
    vi.spyOn(registerData, 'fetchNextNumbers').mockResolvedValue({ bookNo: '00010', pageNo: '00007' })
    renderDialog()
    await waitFor(() => expect(screen.getByLabelText(/^Book no\./)).toHaveValue('00010'))
    expect(screen.getByLabelText(/^Page no\./)).toHaveValue('00007')
    expect(screen.queryByLabelText('Line no. (optional)')).not.toBeInTheDocument()
  })

  it('shows the server field errors next to their fields', async () => {
    vi.spyOn(registerData, 'transcribeEntry').mockRejectedValue(
      new ApiError('The given data was invalid.', 422, {
        message: 'The given data was invalid.',
        errors: { ceremonyDate: ['The ceremony date must not be in the future.'], bookNo: ['The book no must not be greater than 20 characters.'], 'details.0.label': ['The label is required.'] },
      }),
    )
    renderDialog()
    await fillRequired()
    await userEvent.clear(screen.getByLabelText('Detail label 1'))
    await userEvent.type(screen.getByLabelText('Detail value 1'), '1 Jan 1998')
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))
    expect(await screen.findByText('The ceremony date must not be in the future.')).toBeInTheDocument()
    expect(screen.getByText('The book no must not be greater than 20 characters.')).toBeInTheDocument()
    expect(screen.getByText('The label is required.')).toBeInTheDocument()
  })

  it('shows a refusal such as a paper line already entered, with no way to override it', async () => {
    vi.spyOn(registerData, 'transcribeEntry').mockRejectedValue(
      new ApiError('This book entry is already in the register as BAP-1998-0001.', 422, { message: 'This book entry is already in the register as BAP-1998-0001.' }),
    )
    renderDialog()
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))
    expect(await screen.findByText('This book entry is already in the register as BAP-1998-0001.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add anyway' })).not.toBeInTheDocument()
  })

  it('lists the possible duplicates on a 409 and resends with confirmDuplicate after Add anyway', async () => {
    const spy = vi
      .spyOn(registerData, 'transcribeEntry')
      .mockRejectedValueOnce(
        new ApiError('An entry for this name and date is already in the register.', 409, {
          message: 'An entry for this name and date is already in the register.',
          duplicates: [{ id: 'r9', registerNumber: 'BAP-1998-0001' }],
        }),
      )
      .mockResolvedValueOnce(registerEntry({ id: 'r10' }))
    const { onCreated } = renderDialog()
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))

    expect(await screen.findByText('An entry for this name and date is already in the register.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'BAP-1998-0001' })).toHaveAttribute('href', '/register/r9')
    expect(spy.mock.calls[0][0]).not.toHaveProperty('confirmDuplicate')

    await userEvent.click(screen.getByRole('button', { name: 'Add anyway' }))
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
    expect(spy.mock.calls[1][0]).toMatchObject({ subjectName: 'Pedro Santos', bookNo: '4', confirmDuplicate: true })
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })

  it('drops the duplicate warning when the form is edited, so a changed entry is checked again', async () => {
    vi.spyOn(registerData, 'transcribeEntry').mockRejectedValue(
      new ApiError('Duplicate.', 409, { message: 'Duplicate.', duplicates: [{ id: 'r9', registerNumber: 'BAP-1998-0001' }] }),
    )
    renderDialog()
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: 'Save entry' }))
    await screen.findByRole('button', { name: 'Add anyway' })
    await userEvent.type(screen.getByLabelText(/^Name/), 'x')
    expect(screen.queryByRole('button', { name: 'Add anyway' })).not.toBeInTheDocument()
  })

  it('closes without sending on Cancel', async () => {
    const spy = vi.spyOn(registerData, 'transcribeEntry')
    const { onClose } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
  })
})
