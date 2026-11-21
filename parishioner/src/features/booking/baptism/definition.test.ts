import { describe, it, expect } from 'vitest'
import { loadFixtures, issueKeys } from '../../../test/fixtures'
import { formatDate } from '../../../lib/domain'
import { fullSchema } from '../wizard/schema'
import { baptismWizard } from './definition'

describe('baptism: client rules match the shared fixtures', () => {
  for (const fixture of loadFixtures('baptism')) {
    it(fixture.name, () => {
      const keys = issueKeys(fullSchema(baptismWizard).safeParse(fixture.formData))
      if (fixture.expectErrorKey) expect(keys).toContain(fixture.expectErrorKey)
      else expect(keys).toEqual([])
    })
  }
})

describe('baptism: steps', () => {
  it('uses the planned step order', () => {
    expect(baptismWizard.steps.map((s) => s.id)).toEqual(['schedule', 'for', 'child', 'parents', 'marriage', 'sponsors', 'documents'])
  })

  it('re-picks the date when the regular/special choice changes', () => {
    expect(baptismWizard.scheduleKeys).toEqual(['scheduleType'])
  })
})

describe('baptism: review shows every collected field', () => {
  const step = (id: string) => baptismWizard.steps.find((s) => s.id === id)!
  const review = (id: string, d: Record<string, unknown>) => Object.fromEntries(step(id).review!(d))

  it('child, including sex', () => {
    expect(
      review('child', {
        childFirstName: 'Ana', childMiddleName: 'Lim', childLastName: 'Reyes', childSuffix: 'Jr.',
        childDateOfBirth: '2026-04-02', childPlaceOfBirth: 'Balagtas', childSex: 'female',
      }),
    ).toEqual({ Name: 'Ana Lim Reyes Jr.', 'Date of birth': formatDate('2026-04-02'), 'Place of birth': 'Balagtas', Sex: 'Female' })
  })

  it('father with every field, mother and residence', () => {
    expect(
      review('parents', {
        fatherFirstName: 'Jose', fatherMiddleName: 'M', fatherLastName: 'Reyes', fatherPlaceOfBirth: 'Pandi', fatherReligion: 'Roman Catholic',
        motherFirstName: 'Maria', motherLastName: 'Santos', motherPlaceOfBirth: 'Bocaue', motherReligion: 'Aglipayan',
        parentsResidence: 'Balagtas, Bulacan', parentsResidenceLine: '12 Rizal St',
      }),
    ).toEqual({
      Father: 'Jose M Reyes',
      "Father's place of birth": 'Pandi',
      "Father's religion": 'Roman Catholic',
      Mother: 'Maria Santos',
      "Mother's place of birth": 'Bocaue',
      "Mother's religion": 'Aglipayan',
      Residence: '12 Rizal St, Balagtas, Bulacan',
    })
  })

  it('father left out shows the reason and no father details', () => {
    const r = review('parents', { fatherOmitted: true, fatherOmittedReason: 'Unknown', motherFirstName: 'Maria', motherLastName: 'Santos' })
    expect(r.Father).toBe('Not included (Unknown)')
    expect(Object.keys(r).some((k) => k.startsWith("Father's"))).toBe(false)
  })

  it('mother left out shows the reason and no mother details', () => {
    const r = review('parents', { motherOmitted: true, motherOmittedReason: 'Unknown', fatherFirstName: 'Jose', fatherLastName: 'Santos' })
    expect(r.Mother).toBe('Not included (Unknown)')
    expect(Object.keys(r).some((k) => k.startsWith("Mother's"))).toBe(false)
  })

  it("parents' marriage with date and place", () => {
    expect(review('marriage', { parentsMarriage: 'civil', parentsMarriageDate: '2020-01-01', parentsMarriagePlace: 'Balagtas' })).toEqual({
      Status: 'Civil marriage only', Date: formatDate('2020-01-01'), Place: 'Balagtas',
    })
    expect(review('marriage', { parentsMarriage: 'not_married', parentsMarriageDate: '2020-01-01' })).toEqual({ Status: 'Not married' })
  })

  it('godparents are numbered as Godparent', () => {
    const r = review('sponsors', { sponsors: [{ role: 'ninong', firstName: 'A', lastName: 'B', age: 30, religion: 'Roman Catholic', residence: 'X' }] })
    expect(r['Godparent 1']).toBe('A B')
    expect(r['Godparent 1 role']).toBe('Ninong (godfather)')
  })
})
