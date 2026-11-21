import { describe, it, expect } from 'vitest'
import { loadFixtures, issueKeys } from '../../../test/fixtures'
import { fullSchema } from '../wizard/schema'
import { funeralWizard } from './definition'

describe('funeral: client rules match the shared fixtures', () => {
  for (const fixture of loadFixtures('funeral')) {
    it(fixture.name, () => {
      const keys = issueKeys(fullSchema(funeralWizard).safeParse(fixture.formData))
      if (fixture.expectErrorKey) expect(keys).toContain(fixture.expectErrorKey)
      else expect(keys).toEqual([])
    })
  }
})

describe('funeral: scheduling', () => {
  it('asks for the date and time first, before "Who is this for?", before the long forms', () => {
    expect(funeralWizard.steps.map((s) => s.id)).toEqual(['schedule', 'for', 'deceased', 'mass', 'documents'])
  })

  it('clears the chosen slot when the Mass type changes (a house Mass is off-site and adds travel time)', () => {
    expect(funeralWizard.scheduleKeys).toEqual(['massType'])
  })

  it('asks where the Mass will be on the schedule step (it decides the free times), still required, under the same key', () => {
    const schedule = funeralWizard.steps.find((s) => s.id === 'schedule')!
    const mass = funeralWizard.steps.find((s) => s.id === 'mass')!
    expect(Object.keys(schedule.shape!)).toContain('massType')
    expect(Object.keys(mass.shape!)).not.toContain('massType')
    expect(issueKeys(fullSchema(funeralWizard).safeParse({}))).toContain('massType')
  })

  it('a church Mass drops the wake address whichever step saves it', () => {
    for (const id of ['schedule', 'mass']) {
      const step = funeralWizard.steps.find((s) => s.id === id)!
      expect(step.clears!({ massType: 'church' })).toContain('houseMassAddress')
      expect(step.clears!({ massType: 'house' })).toEqual([])
    }
  })
})

describe('funeral: review', () => {
  it("shows the deceased's sex, civil status and religion", () => {
    const step = funeralWizard.steps.find((s) => s.id === 'deceased')!
    const out = step.review!({
      deceasedFirstName: 'Juan', deceasedLastName: 'Cruz', deceasedSex: 'male',
      deceasedCivilStatus: 'widowed', deceasedReligion: 'Roman Catholic',
    })
    const labels = Object.fromEntries(out)
    expect(labels['Sex']).toBe('Male')
    expect(labels['Civil status']).toBeTruthy()
    expect(labels['Religion']).toBe('Roman Catholic')
  })
})
