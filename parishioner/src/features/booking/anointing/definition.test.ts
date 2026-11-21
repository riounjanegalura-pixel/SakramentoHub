import { describe, it, expect, afterEach, vi } from 'vitest'
import { loadFixtures, issueKeys } from '../../../test/fixtures'
import { fullSchema } from '../wizard/schema'
import { anointingWizard } from './definition'
import { ageFrom, splitName } from '../wizard/review'

describe('anointing: client rules match the shared fixtures', () => {
  for (const fixture of loadFixtures('anointing')) {
    it(fixture.name, () => {
      const keys = issueKeys(fullSchema(anointingWizard).safeParse(fixture.formData))
      if (fixture.expectErrorKey) expect(keys).toContain(fixture.expectErrorKey)
      else expect(keys).toEqual([])
    })
  }

  it('splits an account name for self-prefill', () => {
    expect(splitName('Ma. Teresa Dela Cruz')).toEqual({ first: 'Ma. Teresa Dela', last: 'Cruz' })
    expect(splitName('Consolacion')).toEqual({ first: 'Consolacion', last: '' })
  })

  it('splits with extra spaces and an empty string', () => {
    expect(splitName('  Ma.   Teresa  Cruz ')).toEqual({ first: 'Ma. Teresa', last: 'Cruz' })
    expect(splitName('')).toEqual({ first: '', last: '' })
  })
})

describe('anointing: steps', () => {
  it('keeps the patient before the schedule: the urgency question decides whether there is a schedule at all', () => {
    expect(anointingWizard.steps.map((s) => s.id)).toEqual(['for', 'patient', 'schedule'])
  })
})

describe('anointing: emergency path', () => {
  const base = {
    bookingFor: 'other', relationship: 'parent', patientFirstName: 'Consolacion', patientLastName: 'Aquino',
    patientSex: 'female', patientAge: 88, locationType: 'hospital', hospitalName: 'BMC', hospitalRoom: 'Ward 3',
  }

  it('is valid without any appointment (the schema never asks for one)', () => {
    const keys = issueKeys(fullSchema(anointingWizard).safeParse({ ...base, alternatePhone: '09171234567', inDangerOfDeath: true }))
    expect(keys).toEqual([])
  })

  it('needs a number to call when urgent and the profile has no mobile', () => {
    const keys = issueKeys(fullSchema(anointingWizard).safeParse({ ...base, inDangerOfDeath: true }))
    expect(keys).toContain('alternatePhone')
    expect(issueKeys(fullSchema(anointingWizard).safeParse({ ...base, inDangerOfDeath: false }))).toEqual([])
  })

  it('still needs the patient details when urgent', () => {
    const keys = issueKeys(fullSchema(anointingWizard).safeParse({ ...base, hospitalRoom: '', inDangerOfDeath: true }))
    expect(keys).toContain('hospitalRoom')
  })

  it('clears the chosen slot when the urgent answer changes', () => {
    expect(anointingWizard.scheduleKeys).toEqual(['inDangerOfDeath'])
  })
})

describe('anointing: review', () => {
  const patient = anointingWizard.steps.find((s) => s.id === 'patient')!

  it('shows every field the patient step collects (hospital)', () => {
    const labels = Object.fromEntries(
      patient.review!({
        patientFirstName: 'Consolacion', patientLastName: 'Aquino', patientSex: 'female', patientAge: 88,
        locationType: 'hospital', hospitalName: 'BMC', hospitalRoom: 'Ward 3', inDangerOfDeath: true,
      }),
    )
    expect(labels).toEqual({
      Patient: 'Consolacion Aquino', Sex: 'Female', Age: '88', Location: 'In a hospital',
      Hospital: 'BMC', 'Room / ward / bed': 'Ward 3', 'In danger of death': 'Yes',
    })
  })

  it('shows the home address when the patient is at home', () => {
    const labels = Object.fromEntries(
      patient.review!({
        patientFirstName: 'Juan', patientLastName: 'Cruz', patientSex: 'male', patientAge: 70,
        locationType: 'home', patientAddress: 'Balagtas, Bulacan', inDangerOfDeath: false,
      }),
    )
    expect(labels['Home address']).toBe('Balagtas, Bulacan')
    expect(labels['Location']).toBe('At home')
    expect(labels['In danger of death']).toBe('No')
  })
})

describe('ageFrom (Manila time)', () => {
  afterEach(() => vi.useRealTimers())

  it('has not had the birthday yet this year', () => {
    vi.useFakeTimers({ now: new Date('2026-03-10T04:00:00Z') })
    expect(ageFrom('1990-05-01')).toBe(35)
  })

  it('counts the birthday once it is the birthday in Manila, even if UTC is still the day before', () => {
    vi.useFakeTimers({ now: new Date('2026-03-09T20:00:00Z') }) // 04:00 on 10 Mar in Manila
    expect(ageFrom('1990-03-10')).toBe(36)
  })

  it('returns undefined for missing, invalid or future dates', () => {
    vi.useFakeTimers({ now: new Date('2026-03-10T04:00:00Z') })
    expect(ageFrom(undefined)).toBeUndefined()
    expect(ageFrom('not-a-date')).toBeUndefined()
    expect(ageFrom('2026-13-45')).toBeUndefined()
    expect(ageFrom('2030-01-01')).toBeUndefined()
  })
})
