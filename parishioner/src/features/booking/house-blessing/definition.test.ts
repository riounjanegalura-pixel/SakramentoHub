import { describe, it, expect } from 'vitest'
import { loadFixtures, issueKeys } from '../../../test/fixtures'
import { fullSchema } from '../wizard/schema'
import { houseBlessingWizard } from './definition'

describe('house blessing: steps', () => {
  it('asks for the date and time first, before "Who is this for?"', () => {
    expect(houseBlessingWizard.steps.map((s) => s.id)).toEqual(['schedule', 'for', 'property'])
  })
})

describe('house blessing: client rules match the shared fixtures', () => {
  for (const fixture of loadFixtures('house-blessing')) {
    it(fixture.name, () => {
      const keys = issueKeys(fullSchema(houseBlessingWizard).safeParse(fixture.formData))
      if (fixture.expectErrorKey) expect(keys).toContain(fixture.expectErrorKey)
      else expect(keys).toEqual([])
    })
  }
})
