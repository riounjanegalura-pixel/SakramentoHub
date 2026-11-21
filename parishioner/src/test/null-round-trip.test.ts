import { describe, it, expect } from 'vitest'
import { loadFixtures } from './fixtures'
import { fullSchema } from '../features/booking/wizard/schema'
import { wizardFor } from '../features/booking/wizard/registry'
import type { Sacrament } from '../lib/types'

const SACRAMENTS: Sacrament[] = ['baptism', 'confirmation', 'wedding', 'funeral', 'anointing', 'house-blessing']

/**
 * Laravel stores a blank answer as null, and a resumed draft or returned
 * booking is re-validated from that stored shape. So for every valid fixture,
 * every field of the wizard that the fixture leaves blank must also be
 * accepted as null — otherwise Review shows "expected string, received null"
 * and Submit is disabled.
 */
describe('a saved booking read back from the server still passes the client rules', () => {
  for (const sacrament of SACRAMENTS) {
    const definition = wizardFor(sacrament)!
    const keys = definition.steps.flatMap((step) => Object.keys(step.shape ?? {}))

    for (const fixture of loadFixtures(sacrament).filter((f) => f.name.startsWith('valid-'))) {
      it(`${sacrament}/${fixture.name} with every blank field stored as null`, () => {
        const stored: Record<string, unknown> = { ...fixture.formData }
        for (const key of keys) {
          if (stored[key] === undefined || stored[key] === '') stored[key] = null
        }

        const result = fullSchema(definition).safeParse(stored)
        expect(result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)).toEqual([])
      })
    }
  }
})
