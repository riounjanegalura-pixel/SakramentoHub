import { describe, it, expect } from 'vitest'
import { loadFixtures } from './fixtures'

describe('fixture harness', () => {
  it.each(['baptism', 'confirmation', 'wedding', 'funeral', 'anointing', 'house-blessing'])('%s has valid fixtures with formData', (sacrament) => {
    const fixtures = loadFixtures(sacrament)
    const valid = fixtures.filter((f) => f.name.startsWith('valid-'))
    expect(valid.length).toBeGreaterThanOrEqual(1)
    for (const f of fixtures) expect(f.formData).toBeDefined()
  })

  it('throws a clear error for an unknown sacrament', () => {
    expect(() => loadFixtures('nope')).toThrow(/No fixtures directory for "nope"/)
  })
})
