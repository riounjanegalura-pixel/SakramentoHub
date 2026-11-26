import { render, screen, fireEvent, within } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import { StepperHeader } from './StepperHeader'
import { expectNoA11yViolations } from '../../test/a11y'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motion.reduced,
}))

const STEPS = ['Booking for', 'Child', 'Parents', 'Schedule', 'Review & Submit']

function renderHeader(currentStep = 2, onBack = () => {}) {
  return render(<StepperHeader title="Baptism" steps={STEPS} currentStep={currentStep} onBack={onBack} />)
}

describe('StepperHeader', () => {
  beforeEach(() => {
    motion.reduced = false
  })

  it('shows the sacrament and says which step this is in words', () => {
    renderHeader(2)
    expect(screen.getByRole('heading', { level: 1, name: 'Baptism' })).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument()
  })

  it('is a list named Booking steps with every step name available to screen readers', () => {
    renderHeader(2)
    const list = screen.getByRole('list', { name: 'Booking steps' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(STEPS.map((s) => expect.stringContaining(s)))
  })

  it('marks only the current step with aria-current="step" and shows its name', () => {
    renderHeader(3)
    const items = within(screen.getByRole('list', { name: 'Booking steps' })).getAllByRole('listitem')
    expect(items.filter((li) => li.getAttribute('aria-current') === 'step')).toEqual([items[2]])
    // On a phone every segment name is for screen readers; the current name is said in the visible "Step 3 of 5 · Parents" line.
    expect(within(items[2]).getByText('Parents').className).toMatch(/sr-only/)
    expect(screen.getByText('Step 3 of 5').parentElement).toHaveTextContent('Step 3 of 5 · Parents')
  })

  it('draws the active segment as the shared wizard-progress layout element, in navy', () => {
    renderHeader(3)
    const items = within(screen.getByRole('list', { name: 'Booking steps' })).getAllByRole('listitem')
    const active = document.querySelectorAll('[data-progress-fill="wizard-progress"]')
    expect(active).toHaveLength(1)
    expect(items[2]).toContainElement(active[0] as HTMLElement)
    expect((active[0] as HTMLElement).className).toMatch(/bg-navy/)
  })

  it('colours completed segments navy and upcoming ones as plain track', () => {
    renderHeader(3)
    const segments = Array.from(document.querySelectorAll('[data-segment]'))
    expect(segments.map((s) => s.getAttribute('data-segment'))).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming'])
    expect(segments[0].className).toMatch(/bg-navy/)
    expect(segments[4].className).not.toMatch(/bg-navy|bg-gold/)
  })

  it('under reduced motion the active segment is a plain element with no shared-layout animation', () => {
    motion.reduced = true
    renderHeader(3)
    expect(document.querySelector('[data-progress-fill="wizard-progress"]')).toBeNull()
    expect(document.querySelector('[data-segment="current"] [data-active]')).not.toBeNull()
  })

  it('calls onBack when the back button is pressed, and the button is a 44 px target', () => {
    const onBack = vi.fn()
    renderHeader(2, onBack)
    const back = screen.getByRole('button', { name: /go back/i })
    expect(back.className).toMatch(/size-12/)
    fireEvent.click(back)
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('has no axe violations', async () => {
    const { container } = renderHeader(2)
    await expectNoA11yViolations(container)
  })
})
