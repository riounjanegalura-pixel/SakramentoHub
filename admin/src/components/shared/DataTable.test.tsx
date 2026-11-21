import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable, createDataTableColumns } from './DataTable'
import { expectNoA11yViolations } from '../../test/a11y'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motion.reduced,
}))

beforeEach(() => {
  motion.reduced = false
})

type Item = { id: number; name: string; fee: number | null }

const cols = createDataTableColumns<Item>((col) => [
  col.accessor('name', {
    header: 'Name',
    cell: (info) => <a href={`/items/${info.row.original.id}`}>{info.getValue()}</a>,
  }),
  col.accessor('fee', { header: 'Fee', cell: (info) => info.getValue() ?? '—' }),
  col.display({
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    cell: (info) => <button type="button">Edit {info.row.original.name}</button>,
  }),
])

const many: Item[] = Array.from({ length: 500 }, (_, i) => ({
  id: i,
  name: `Row ${String(i).padStart(3, '0')}`,
  fee: i % 7 === 0 ? null : i,
}))

const few: Item[] = [
  { id: 1, name: 'Bravo', fee: 300 },
  { id: 2, name: 'Alpha', fee: null },
  { id: 3, name: 'Charlie', fee: 100 },
  { id: 4, name: 'Delta', fee: 200 },
]

/** The visible text of one column, top to bottom, header row excluded. */
function columnText(index: number): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[index].textContent ?? '')
}

describe('DataTable', () => {
  it('is a real table with a caption and column headers scoped to their column', () => {
    render(<DataTable columns={cols} data={few} caption="Test items" />)
    const table = screen.getByRole('table', { name: 'Test items' })
    expect(table.querySelector('caption')).toHaveTextContent('Test items')
    const headers = within(table).getAllByRole('columnheader')
    expect(headers).toHaveLength(3)
    headers.forEach((h) => expect(h).toHaveAttribute('scope', 'col'))
  })

  it('pages 500 client rows 25 at a time with the shared pagination', async () => {
    render(<DataTable columns={cols} data={many} caption="Test items" />)
    expect(screen.getAllByRole('row')).toHaveLength(26) // header + 25
    expect(screen.getByText(/Page 1 of 20/)).toBeInTheDocument()
    expect(screen.getByText('Row 024')).toBeInTheDocument()
    expect(screen.queryByText('Row 025')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getAllByRole('row')).toHaveLength(26)
    expect(screen.getByText('Row 025')).toBeInTheDocument()
    expect(screen.getByText(/Page 2 of 20/)).toBeInTheDocument()
  })

  it('honours a custom page size', () => {
    render(<DataTable columns={cols} data={many} caption="Test items" pageSize={10} />)
    expect(screen.getAllByRole('row')).toHaveLength(11)
  })

  it('cycles a header through ascending, descending and unsorted, and says so in aria-sort', async () => {
    render(<DataTable columns={cols} data={few} caption="Test items" />)
    const header = screen.getByRole('columnheader', { name: /fee/i })
    const button = within(header).getByRole('button', { name: /fee/i })
    expect(header).toHaveAttribute('aria-sort', 'none')

    await userEvent.click(button)
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    expect(columnText(0)).toEqual(['Charlie', 'Delta', 'Bravo', 'Alpha'])

    await userEvent.click(button)
    expect(header).toHaveAttribute('aria-sort', 'descending')
    expect(columnText(0)).toEqual(['Bravo', 'Delta', 'Charlie', 'Alpha'])

    await userEvent.click(button)
    expect(header).toHaveAttribute('aria-sort', 'none')
    expect(columnText(0)).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta'])
  })

  it('sorts from the keyboard with Enter and Space on the header button', async () => {
    render(<DataTable columns={cols} data={few} caption="Test items" />)
    const header = screen.getByRole('columnheader', { name: /name/i })
    within(header).getByRole('button').focus()
    await userEvent.keyboard('{Enter}')
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.keyboard(' ')
    expect(header).toHaveAttribute('aria-sort', 'descending')
  })

  it('keeps null values last in ascending and in descending order', async () => {
    render(<DataTable columns={cols} data={few} caption="Test items" />)
    const button = within(screen.getByRole('columnheader', { name: /fee/i })).getByRole('button')
    await userEvent.click(button)
    expect(columnText(1)).toEqual(['100', '200', '300', '—'])
    await userEvent.click(button)
    expect(columnText(1)).toEqual(['300', '200', '100', '—'])
  })

  it('sorts all 500 rows with nulls at the end, not only the page shown', async () => {
    render(<DataTable columns={cols} data={many} caption="Test items" />)
    await userEvent.click(within(screen.getByRole('columnheader', { name: /fee/i })).getByRole('button'))
    expect(columnText(1)[0]).toBe('1')
    await userEvent.click(within(screen.getByRole('columnheader', { name: /fee/i })).getByRole('button'))
    expect(columnText(1)[0]).toBe('499')
  })

  it('does not offer sorting on a column without values', () => {
    render(<DataTable columns={cols} data={few} caption="Test items" />)
    const actions = screen.getAllByRole('columnheader')[2]
    expect(actions).not.toHaveAttribute('aria-sort')
    expect(within(actions).queryByRole('button')).not.toBeInTheDocument()
  })

  describe('server-paginated', () => {
    const meta = { current_page: 2, last_page: 3, per_page: 30, total: 75 }

    it('renders exactly the rows given, without slicing, and pages through the server', async () => {
      const onPageChange = vi.fn()
      const page = many.slice(0, 30)
      render(<DataTable columns={cols} data={page} caption="Test items" serverPagination={{ meta, onPageChange }} />)
      expect(screen.getAllByRole('row')).toHaveLength(31)
      expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
      expect(onPageChange).toHaveBeenCalledWith(3)
    })

    it('sorts the rows on the page and says the order is within this page', async () => {
      render(<DataTable columns={cols} data={few} caption="Test items" serverPagination={{ meta, onPageChange: vi.fn() }} />)
      expect(screen.queryByText('Sorted within this page.')).not.toBeInTheDocument()
      await userEvent.click(within(screen.getByRole('columnheader', { name: /fee/i })).getByRole('button'))
      expect(columnText(1)).toEqual(['100', '200', '300', '—'])
      expect(screen.getByText('Sorted within this page.')).toBeInTheDocument()
    })
  })

  describe('states', () => {
    it('loading: the final table shape with skeleton rows, aria-busy and a Loading label', () => {
      render(<DataTable columns={cols} data={[]} caption="Test items" isLoading />)
      const table = screen.getByRole('table', { name: 'Test items' })
      expect(table).toHaveAttribute('aria-busy', 'true')
      expect(within(table).getAllByRole('columnheader')).toHaveLength(3)
      expect(within(table).getAllByRole('row')).toHaveLength(7) // header + 6 skeleton rows
      expect(screen.getByText('Loading')).toHaveClass('sr-only')
    })

    it('empty: shows the empty state inside the table and no pagination', () => {
      render(<DataTable columns={cols} data={[]} caption="Test items" emptyState={<p>No items yet.</p>} />)
      const table = screen.getByRole('table', { name: 'Test items' })
      expect(within(table).getByText('No items yet.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument()
    })

    it('error: says what happened and Retry calls onRetry', async () => {
      const onRetry = vi.fn()
      render(<DataTable columns={cols} data={[]} caption="Test items" error={{ message: 'Could not load items: Boom', onRetry }} />)
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load items: Boom')
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(onRetry).toHaveBeenCalledTimes(1)
    })
  })

  describe('rows', () => {
    it('calls onRowClick when the row is clicked, but not for a control inside it', async () => {
      const onRowClick = vi.fn()
      render(<DataTable columns={cols} data={few} caption="Test items" onRowClick={onRowClick} />)
      await userEvent.click(screen.getByRole('cell', { name: '300' }))
      expect(onRowClick).toHaveBeenCalledWith(few[0])
      onRowClick.mockClear()
      await userEvent.click(screen.getByRole('button', { name: 'Edit Bravo' }))
      expect(onRowClick).not.toHaveBeenCalled()
    })

    it('Enter on the first-cell link calls onRowClick', async () => {
      const onRowClick = vi.fn()
      render(<DataTable columns={cols} data={few} caption="Test items" onRowClick={onRowClick} />)
      screen.getByRole('link', { name: 'Alpha' }).focus()
      await userEvent.keyboard('{Enter}')
      expect(onRowClick).toHaveBeenCalledTimes(1)
      expect(onRowClick).toHaveBeenCalledWith(few[1])
    })

    it('ArrowDown and ArrowUp move between rows by their first-cell link', async () => {
      render(<DataTable columns={cols} data={few} caption="Test items" onRowClick={vi.fn()} />)
      screen.getByRole('link', { name: 'Bravo' }).focus()
      await userEvent.keyboard('{ArrowDown}')
      expect(screen.getByRole('link', { name: 'Alpha' })).toHaveFocus()
      await userEvent.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}')
      expect(screen.getByRole('link', { name: 'Bravo' })).toHaveFocus()
    })

    it('never makes a bare row focusable', () => {
      render(<DataTable columns={cols} data={few} caption="Test items" onRowClick={vi.fn()} />)
      screen.getAllByRole('row').forEach((r) => {
        expect(r).not.toHaveAttribute('tabindex')
        expect(r).not.toHaveAttribute('role', 'button')
      })
    })

    it('density: compact by prop, and the toggle switches it', async () => {
      render(<DataTable columns={cols} data={few} caption="Test items" density="compact" />)
      const table = screen.getByRole('table', { name: 'Test items' })
      expect(table).toHaveAttribute('data-density', 'compact')
      const toggle = screen.getByRole('button', { name: 'Compact rows' })
      expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(toggle)
      expect(table).toHaveAttribute('data-density', 'comfortable')
      expect(toggle).toHaveAttribute('aria-pressed', 'false')
    })

    it('under reduced motion every row shows at once (no opacity 0 start)', () => {
      motion.reduced = true
      render(<DataTable columns={cols} data={few} caption="Test items" />)
      screen.getAllByRole('row').slice(1).forEach((r) => expect(r.style.opacity).not.toBe('0'))
    })
  })

  describe('accessibility', () => {
    it('has no axe violations with data, sorted', async () => {
      const { container } = render(<DataTable columns={cols} data={many} caption="Test items" onRowClick={vi.fn()} />)
      await userEvent.click(within(screen.getByRole('columnheader', { name: /fee/i })).getByRole('button'))
      await expectNoA11yViolations(container)
    })

    it('has no axe violations while loading, empty, or failed', async () => {
      const loading = render(<DataTable columns={cols} data={[]} caption="Loading items" isLoading />)
      await expectNoA11yViolations(loading.container)
      loading.unmount()
      const empty = render(<DataTable columns={cols} data={[]} caption="Empty items" emptyState={<p>None.</p>} />)
      await expectNoA11yViolations(empty.container)
      empty.unmount()
      const failed = render(<DataTable columns={cols} data={[]} caption="Failed items" error={{ message: 'Boom', onRetry: vi.fn() }} />)
      await expectNoA11yViolations(failed.container)
    })
  })
})
