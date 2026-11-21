import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { ClampedText } from './ClampedText'
import { DataTable, createDataTableColumns } from './DataTable'

const LONG = 'A very long note that keeps going and going well past what a table cell should ever show on one or two lines'

describe('ClampedText', () => {
  it('clamps to one line from sm up and keeps the full value in title', () => {
    render(<ClampedText>{LONG}</ClampedText>)
    const el = screen.getByText(LONG)
    expect(el).toHaveAttribute('title', LONG)
    expect(el).toHaveClass('sm:truncate', 'sm:max-w-xs')
  })

  it('clamps to two lines from sm up on request', () => {
    render(<ClampedText lines={2}>{LONG}</ClampedText>)
    expect(screen.getByText(LONG)).toHaveClass('sm:line-clamp-2')
  })

  it('never clamps on phones: no unscoped clamp classes, text still wraps', () => {
    render(<ClampedText lines={2}>{LONG}</ClampedText>)
    const el = screen.getByText(LONG)
    for (const c of ['truncate', 'line-clamp-2', 'max-w-xs']) expect(el).not.toHaveClass(c)
    expect(el).toHaveClass('break-words')
  })

  it('renders nothing for an empty value', () => {
    const { container } = render(<ClampedText>{null}</ClampedText>)
    expect(container).toBeEmptyDOMElement()
  })

  it('does not use motion classes', () => {
    render(<ClampedText>{LONG}</ClampedText>)
    expect(screen.getByText(LONG).className).not.toMatch(/transition|animate/)
  })
})

describe('clamped cell inside DataTable', () => {
  type Row = { id: number; note: string }
  const cols = createDataTableColumns<Row>((col) => [
    col.accessor('note', { header: 'Note', cell: ({ row }) => <ClampedText>{row.original.note}</ClampedText> }),
  ])

  it('keeps the full text in the cell and in title', () => {
    render(<DataTable columns={cols} data={[{ id: 1, note: LONG }]} caption="Notes" />)
    const el = screen.getByTitle(LONG)
    expect(el).toHaveTextContent(LONG)
    expect(el).toHaveClass('sm:truncate')
  })

  it('keeps the phone card layout that wraps cell text', () => {
    render(<DataTable columns={cols} data={[{ id: 1, note: LONG }]} caption="Notes" />)
    const td = screen.getByTitle(LONG).closest('td')!
    expect(td.className).toContain('max-sm:[overflow-wrap:anywhere]')
    expect(td.className).toContain('max-sm:block')
  })
})
