import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { z } from 'zod'
import { useBookingStore } from '../../../stores/booking-store'
import { WizardContext } from './WizardContext'
import { useStepForm } from './useStepForm'
import type { WizardDefinition, WizardStep } from './types'

/** Fixture: a one-step definition whose answer (church vs house Mass) changes which times are offered. */
const massStep: WizardStep = {
  id: 'mass',
  title: 'Mass',
  shape: { massType: z.enum(['church', 'house']), intention: z.string().optional() },
  Component: MassView,
}

function MassView({ step }: { step: WizardStep }) {
  const { form, onContinue } = useStepForm(step)
  return (
    <>
      <label htmlFor="massType">Mass</label>
      <select id="massType" {...form.register('massType')}>
        <option value="church">Church</option>
        <option value="house">House</option>
      </select>
      <label htmlFor="intention">Intention</label>
      <input id="intention" {...form.register('intention')} />
      <button type="button" onClick={onContinue}>
        Continue
      </button>
    </>
  )
}

const definition: WizardDefinition = { sacrament: 'funeral', steps: [massStep], prepare: [], scheduleKeys: ['massType'] }
const next = vi.fn()

function renderStep() {
  render(
    <WizardContext.Provider value={{ definition, stepIndex: 0, total: 2, next, goTo: vi.fn(), cancel: vi.fn() }}>
      <MassView step={massStep} />
    </WizardContext.Provider>,
  )
}

describe('useStepForm: schedule-affecting answers', () => {
  beforeEach(() => {
    next.mockClear()
    useBookingStore.getState().startBooking('funeral')
    useBookingStore.getState().updateFormData({ massType: 'church' })
    useBookingStore.getState().setAppointment('2026-11-10', '10:00')
  })

  it('clears the chosen date and time when a schedule key changes', async () => {
    const user = userEvent.setup()
    renderStep()
    await user.selectOptions(screen.getByLabelText('Mass'), 'house')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(next).toHaveBeenCalled())
    const s = useBookingStore.getState()
    expect(s.formData.massType).toBe('house')
    expect([s.appointmentDate, s.appointmentStart]).toEqual([null, null])
  })

  it('keeps the chosen date and time when only other answers change', async () => {
    const user = userEvent.setup()
    renderStep()
    await user.type(screen.getByLabelText('Intention'), 'For the soul of Lola')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(next).toHaveBeenCalled())
    const s = useBookingStore.getState()
    expect([s.appointmentDate, s.appointmentStart]).toEqual(['2026-11-10', '10:00'])
  })
})

/** Fixture: a toggle that hides a group of fields; `clears` names the hidden keys. */
const toggleStep: WizardStep = {
  id: 'toggle',
  title: 'Toggle',
  shape: { omit: z.boolean().nullish(), detail: z.string().optional() },
  clears: (d) => (d.omit === true ? ['detail'] : []),
  Component: ToggleView,
}

function ToggleView({ step }: { step: WizardStep }) {
  const { form, onContinue } = useStepForm(step)
  return (
    <>
      <label htmlFor="omit">Leave out</label>
      <input id="omit" type="checkbox" {...form.register('omit')} />
      <label htmlFor="detail">Detail</label>
      <input id="detail" {...form.register('detail')} />
      <button type="button" onClick={onContinue}>
        Continue
      </button>
    </>
  )
}

describe('useStepForm: answers hidden by a toggle', () => {
  const toggleDefinition: WizardDefinition = { sacrament: 'funeral', steps: [toggleStep], prepare: [] }

  function renderToggle() {
    return render(
      <WizardContext.Provider value={{ definition: toggleDefinition, stepIndex: 0, total: 2, next, goTo: vi.fn(), cancel: vi.fn(), registerDraft: vi.fn() }}>
        <ToggleView step={toggleStep} />
      </WizardContext.Provider>,
    )
  }

  beforeEach(() => {
    next.mockClear()
    useBookingStore.getState().startBooking('funeral')
    useBookingStore.getState().updateFormData({ omit: false, detail: 'old answer' })
  })

  it('removes the hidden keys from the draft on Continue', async () => {
    const user = userEvent.setup()
    renderToggle()
    await user.click(screen.getByLabelText('Leave out'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(next).toHaveBeenCalled())
    const saved = useBookingStore.getState().formData
    expect(saved.omit).toBe(true)
    expect(saved.detail).toBeUndefined()
    expect(JSON.parse(JSON.stringify(saved))).not.toHaveProperty('detail')
  })

  it('removes the hidden keys when leaving through Back, too', async () => {
    const user = userEvent.setup()
    const { unmount } = renderToggle()
    await user.click(screen.getByLabelText('Leave out'))
    unmount()

    const saved = useBookingStore.getState().formData
    expect(saved.omit).toBe(true)
    expect(saved.detail).toBeUndefined()
  })

  it('keeps the answers while the toggle leaves them relevant', async () => {
    const user = userEvent.setup()
    renderToggle()
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(next).toHaveBeenCalled())
    expect(useBookingStore.getState().formData.detail).toBe('old answer')
  })
})
