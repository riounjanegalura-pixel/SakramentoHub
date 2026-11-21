import { describe, it, expect } from 'vitest'
import { loadFixtures, issueKeys } from '../../../test/fixtures'
import { formatDate } from '../../../lib/domain'
import { fullSchema } from '../wizard/schema'
import { confirmationWizard } from './definition'

describe('confirmation: client rules match the shared fixtures', () => {
  for (const fixture of loadFixtures('confirmation')) {
    it(fixture.name, () => {
      const keys = issueKeys(fullSchema(confirmationWizard).safeParse(fixture.formData))
      if (fixture.expectErrorKey) expect(keys).toContain(fixture.expectErrorKey)
      else expect(keys).toEqual([])
    })
  }
})

describe('confirmation: steps', () => {
  it('uses the planned step order', () => {
    expect(confirmationWizard.steps.map((s) => s.id)).toEqual(['schedule', 'for', 'confirmand', 'family', 'baptism', 'sponsors', 'documents'])
  })

  it('needs no schedule keys (the schedule never depends on an answer)', () => {
    expect(confirmationWizard.scheduleKeys).toBeUndefined()
  })
})

describe('confirmation: review shows every collected field', () => {
  const step = (id: string) => confirmationWizard.steps.find((s) => s.id === id)!

  it('confirmand', () => {
    const r = Object.fromEntries(
      step('confirmand').review!({
        confirmandFirstName: 'Ana', confirmandMiddleName: 'Lim', confirmandLastName: 'Reyes',
        confirmandDateOfBirth: '2010-04-02', confirmandPlaceOfBirth: 'Balagtas', confirmandSex: 'female',
      }),
    )
    expect(r).toEqual({ Name: 'Ana Lim Reyes', 'Date of birth': formatDate('2010-04-02'), 'Place of birth': 'Balagtas', Sex: 'Female' })
  })

  it('sponsor with every field', () => {
    const r = Object.fromEntries(
      step('sponsors').review!({
        sponsors: [
          { role: 'ninang', firstName: 'Rosa', middleName: 'M', lastName: 'Cruz', age: 30, religion: 'Roman Catholic', residence: 'Balagtas, Bulacan', residenceLine: '12 Rizal St' },
        ],
      }),
    )
    expect(r).toEqual({
      'Sponsor 1': 'Rosa M Cruz',
      'Sponsor 1 role': 'Ninang (godmother)',
      'Sponsor 1 age': '30',
      'Sponsor 1 religion': 'Roman Catholic',
      'Sponsor 1 residence': '12 Rizal St, Balagtas, Bulacan',
    })
  })
})

describe('confirmation: sponsor refinements', () => {
  const sponsors = confirmationWizard.steps.find((s) => s.id === 'sponsors')!
  const issues = (d: Record<string, unknown>) => {
    const out: Array<{ path: unknown[]; message: string }> = []
    sponsors.refine!(d, { addIssue: (i: { path: unknown[]; message: string }) => out.push(i) } as never)
    return out
  }

  it('gives one issue, not two, for a missing age and religion', () => {
    expect(issues({ sponsors: [{ firstName: 'A', lastName: 'B' }] })).toEqual([])
  })

  it('does not flag a parent when the sponsor name is blank', () => {
    expect(issues({ sponsors: [{ firstName: '', lastName: '' }], fatherFirstName: '', fatherLastName: '' })).toEqual([])
  })

  it('flags a sponsor who shares a parent name', () => {
    const r = issues({ sponsors: [{ firstName: 'Jo', lastName: 'Cruz', age: 30, religion: 'Roman Catholic' }], fatherFirstName: 'jo', fatherLastName: 'CRUZ' })
    expect(r.map((i) => i.message)).toEqual(['A parent cannot be the Confirmation sponsor'])
  })
})

describe('confirmation: review lists every sponsor', () => {
  it('numbers two sponsors fully', () => {
    const sponsors = confirmationWizard.steps.find((s) => s.id === 'sponsors')!
    const r = Object.fromEntries(
      sponsors.review!({
        sponsors: [
          { role: 'ninong', firstName: 'A', lastName: 'B', age: 20, religion: 'Roman Catholic', residence: 'X' },
          { role: 'ninang', firstName: 'C', lastName: 'D', age: 21, religion: 'Roman Catholic', residence: 'Y' },
        ],
      }),
    )
    expect(Object.keys(r)).toHaveLength(10)
    expect(r['Sponsor 2']).toBe('C D')
    expect(r['Sponsor 1 role']).toBe('Ninong (godfather)')
  })
})
