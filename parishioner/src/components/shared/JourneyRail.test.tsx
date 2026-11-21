import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JourneyRail } from './JourneyRail'
import { expectNoA11yViolations } from '../../test/a11y'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motion.reduced,
}))

const stages = [
  { key: 'requested', label: 'Requested', state: 'done' },
  { key: 'review', label: 'Under review', state: 'current' },
  { key: 'paid', label: 'Paid', state: 'future' },
  { key: 'confirmed', label: 'Confirmed', state: 'future' },
  { key: 'completed', label: 'Completed', state: 'future' },
] as const

describe('JourneyRail', () => {
  beforeEach(() => {
    motion.reduced = false
  })

  it('lists the stages in order and marks the current one', () => {
    render(<JourneyRail stages={[...stages]} reference="BAP-2026-0007" />)
    const list = screen.getByRole('list', { name: 'Booking progress' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Requested')]))
    expect(within(list).getByText('Under review').closest('li')).toHaveAttribute('aria-current', 'step')
  })

  it('keeps the stage order and puts aria-current on exactly one stage, with the text "Current step"', () => {
    render(<JourneyRail stages={[...stages]} />)
    const items = within(screen.getByRole('list', { name: 'Booking progress' })).getAllByRole('listitem')
    expect(items.map((li) => li.getAttribute('data-stage'))).toEqual(['requested', 'review', 'paid', 'confirmed', 'completed'])
    expect(items.filter((li) => li.getAttribute('aria-current') === 'step')).toHaveLength(1)
    expect(within(items[1]).getByText('Current step')).toBeInTheDocument()
    expect(screen.getAllByText('Current step')).toHaveLength(1)
  })

  it('draws each state with a different node, not colour alone', () => {
    render(<JourneyRail stages={[...stages]} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0].querySelector('[data-node="done"] svg')).not.toBeNull()
    expect(items[1].querySelector('[data-node="current"] [data-centre]')).not.toBeNull()
    expect(items[2].querySelector('[data-node="future"]')).not.toBeNull()
    expect(within(items[0]).getByText(', done')).toHaveClass('sr-only')
  })

  it('shows the reference in the mono numerals token and selectable', () => {
    render(<JourneyRail stages={[...stages]} reference="BAP-2026-0007" />)
    const ref = screen.getByText('BAP-2026-0007')
    expect(ref.className).toMatch(/font-mono/)
    expect(ref.className).toMatch(/select-all/)
  })

  it('shows a stage note, and labelled terminal rows with an icon for an ended booking', () => {
    render(
      <JourneyRail
        stages={[
          { key: 'requested', label: 'Requested', state: 'done' },
          { key: 'paid', label: 'Paid', state: 'done' },
        ]}
        outcomes={[
          { key: 'cancelled', label: 'Cancelled', tone: 'danger' },
          { key: 'refund', label: 'Refund due', tone: 'neutral' },
        ]}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    const cancelled = within(items[2]).getByText('Cancelled')
    expect(cancelled.closest('li')!.querySelector('[data-node="danger"] svg')).not.toBeNull()
    expect(within(items[3]).getByText('Refund due')).toBeInTheDocument()
    expect(screen.queryByText('Current step')).not.toBeInTheDocument()
  })

  it('shows a note under a stage', () => {
    render(<JourneyRail stages={[{ key: 'requested', label: 'Requested', state: 'done' }, { key: 'review', label: 'Under review', state: 'current', note: 'Changes requested' }]} />)
    expect(within(screen.getByText('Under review').closest('li')!).getByText('Changes requested')).toBeInTheDocument()
  })

  it('under reduced motion every stage shows at once', () => {
    window.matchMedia = (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList
    motion.reduced = true
    const { container } = render(<JourneyRail stages={[...stages]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getAllByRole('listitem').every((li) => getComputedStyle(li).opacity !== '0')).toBe(true)
    // Nothing is hidden or mid-way: no element carries an inline opacity 0 or a starting transform.
    for (const el of container.querySelectorAll<HTMLElement>('*')) {
      expect(el.style.opacity).not.toBe('0')
      expect(el.style.transform).toBe('')
    }
  })

  it('with motion on, the nodes start from a transform only and are never hidden', () => {
    const { container } = render(<JourneyRail stages={[...stages]} />)
    for (const el of container.querySelectorAll<HTMLElement>('*')) expect(el.style.opacity).not.toBe('0')
    expect(container.querySelector<HTMLElement>('[data-node="done"]')!.style.transform).not.toBe('')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <JourneyRail stages={[...stages]} reference="BAP-2026-0007" outcomes={[{ key: 'declined', label: 'Declined', tone: 'danger' }]} />,
    )
    await expectNoA11yViolations(container)
  })
})
