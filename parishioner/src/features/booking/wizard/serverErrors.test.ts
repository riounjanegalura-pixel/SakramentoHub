import { describe, it, expect } from 'vitest'
import { groupServerErrors } from './serverErrors'
import { wizardFor } from './registry'

const funeral = wizardFor('funeral')!
const confirmation = wizardFor('confirmation')!
const indexOf = (def: typeof funeral, id: string) => def.steps.findIndex((s) => s.id === id)

describe('groupServerErrors', () => {
  it('puts each formData error on the step whose shape owns the field', () => {
    const grouped = groupServerErrors(funeral.steps, {
      'formData.deathCertificate': ['Upload the death certificate'],
      'formData.deceasedFirstName': ['Enter a first name'],
    })
    expect(grouped.byStep.documents).toEqual([{ path: 'deathCertificate', message: 'Upload the death certificate' }])
    expect(grouped.byStep.deceased).toEqual([{ path: 'deceasedFirstName', message: 'Enter a first name' }])
    expect(grouped.firstIndex).toBe(indexOf(funeral, 'deceased')) // the earliest failing step
    expect(grouped.unplaced).toEqual([])
  })

  it('maps nested keys by their first segment', () => {
    const grouped = groupServerErrors(confirmation.steps, { 'formData.sponsors.0.age': ['Sponsor must be 16 or older'] })
    expect(grouped.byStep.sponsors).toEqual([{ path: 'sponsors.0.age', message: 'Sponsor must be 16 or older' }])
  })

  it('maps the appointment to the schedule step', () => {
    const grouped = groupServerErrors(funeral.steps, { appointmentStart: ['That time is no longer available.'] })
    expect(grouped.byStep.schedule).toEqual([{ path: 'appointmentStart', message: 'That time is no longer available.' }])
    expect(grouped.firstIndex).toBe(indexOf(funeral, 'schedule'))
  })

  it('keeps messages it cannot place', () => {
    const grouped = groupServerErrors(funeral.steps, { 'formData.somethingNew': ['Odd'], formData: ['Must be an object'] })
    expect(grouped.firstIndex).toBe(-1)
    expect(grouped.unplaced).toEqual(['Odd', 'Must be an object'])
  })
})
