import { describe, it, expect } from 'vitest'
import { loadFixtures, issueKeys } from '../../../test/fixtures'
import { formatDate } from '../../../lib/domain'
import { fullSchema } from '../wizard/schema'
import { weddingWizard } from './definition'

describe('wedding: prefill from the account', () => {
  const base = { id: 'u1', email: 'a@x.com', phone: '', address: '' }
  it('fills the groom for a man and the bride for a woman, and nobody when the sex is unset', () => {
    expect(weddingWizard.prefillSelf!({ ...base, fullName: 'Juan Dela Cruz', sex: 'male', birthDate: '1995-02-03' })).toEqual({
      groomFirstName: 'Juan Dela', groomLastName: 'Cruz', groomDateOfBirth: '1995-02-03',
    })
    expect(weddingWizard.prefillSelf!({ ...base, fullName: 'Ana Reyes', sex: 'female' })).toMatchObject({ brideFirstName: 'Ana', brideLastName: 'Reyes' })
    expect(weddingWizard.prefillSelf!({ ...base, fullName: 'Ana Reyes' })).toEqual({})
  })
})

describe('wedding: client rules match the shared fixtures', () => {
  for (const fixture of loadFixtures('wedding')) {
    it(fixture.name, () => {
      const keys = issueKeys(fullSchema(weddingWizard).safeParse(fixture.formData))
      if (fixture.expectErrorKey) expect(keys).toContain(fixture.expectErrorKey)
      else expect(keys).toEqual([])
    })
  }
})

const valid = loadFixtures('wedding').find((f) => f.name === 'valid-basic')!.formData
const step = (id: string) => weddingWizard.steps.find((s) => s.id === id)!
const reviewOf = (id: string, data: Record<string, unknown>) => Object.fromEntries(step(id).review!(data))

describe('wedding: wizard shape', () => {
  it('has the steps in order, with documents last', () => {
    expect(weddingWizard.steps.map((s) => s.id)).toEqual(['schedule', 'for', 'groom', 'bride', 'sponsors', 'details', 'documents'])
  })

  it('declares no scheduleKeys: the backend schedules a wedding by service alone, never by venue or type', () => {
    expect(weddingWizard.scheduleKeys).toBeUndefined()
  })

  it('requires the widowed spouse death certificate and the annulment decree only for those civil statuses', () => {
    const schema = fullSchema(weddingWizard)
    const without = (key: string, extra: Record<string, unknown>) => {
      const data: Record<string, unknown> = { ...valid, ...extra }
      delete data[key]
      return issueKeys(schema.safeParse(data))
    }
    expect(without('brideSpouseDeathCertificate', {})).toContain('brideSpouseDeathCertificate')
    expect(without('groomNullityDecree', { groomCivilStatus: 'annulled' })).toContain('groomNullityDecree')
    expect(without('groomNullityDecree', {})).not.toContain('groomNullityDecree')
  })
})

describe('wedding: parent citizenship matches the backend max of 60', () => {
  const keysFor = (key: string, length: number) =>
    issueKeys(fullSchema(weddingWizard).safeParse({ ...valid, [key]: 'x'.repeat(length) }))
  for (const key of ['groomFatherCitizenship', 'groomMotherCitizenship', 'brideFatherCitizenship', 'brideMotherCitizenship']) {
    it(`${key}: 60 characters pass, 61 fail`, () => {
      expect(keysFor(key, 60)).not.toContain(key)
      expect(keysFor(key, 61)).toContain(key)
    })
  }
})

describe('wedding: review shows every field each step collects', () => {
  const party = (x: 'groom' | 'bride') => ({
    [`${x}FirstName`]: 'Mark', [`${x}MiddleName`]: 'Reyes', [`${x}LastName`]: 'Garcia', [`${x}Suffix`]: 'Jr.',
    [`${x}DateOfBirth`]: '1996-01-22', [`${x}PlaceOfBirth`]: 'Malolos City, Bulacan',
    [`${x}Citizenship`]: 'Filipino', [`${x}Religion`]: 'Roman Catholic', [`${x}CivilStatus`]: 'annulled',
    [`${x}Residence`]: 'Balagtas, Bulacan', [`${x}ResidenceLine`]: '12 Rizal St',
    [`${x}FatherFirstName`]: 'Antonio', [`${x}FatherLastName`]: 'Garcia', [`${x}FatherCitizenship`]: 'Filipino',
    [`${x}MotherFirstName`]: 'Rosa', [`${x}MotherLastName`]: 'Lim', [`${x}MotherCitizenship`]: 'Chinese',
    [`${x}BaptismParish`]: 'Malolos Cathedral', [`${x}BaptismDate`]: '1996-04-14', [`${x}ConfirmationParish`]: 'Malolos Cathedral',
  })

  for (const x of ['groom', 'bride'] as const) {
    it(`${x}: every collected answer appears, with labels not raw values`, () => {
      const r = reviewOf(x, party(x))
      expect(r['Name']).toBe('Mark Reyes Garcia Jr.')
      expect(r['Date of birth']).toBe(formatDate('1996-01-22'))
      expect(r['Place of birth']).toBe('Malolos City, Bulacan')
      expect(r['Citizenship']).toBe('Filipino')
      expect(r['Religion']).toBe('Roman Catholic')
      expect(r['Civil status']).toBe('Annulled')
      expect(r['Residence']).toBe('12 Rizal St, Balagtas, Bulacan')
      expect(r['Father']).toBe('Antonio Garcia')
      expect(r["Father's citizenship"]).toBe('Filipino')
      expect(r['Mother']).toBe('Rosa Lim')
      expect(r["Mother's citizenship"]).toBe('Chinese')
      expect(r['Parish of baptism']).toBe('Malolos Cathedral')
      expect(r['Date of baptism']).toBe(formatDate('1996-04-14'))
      expect(r['Parish of confirmation']).toBe('Malolos Cathedral')
    })
  }

  it('details: church wedding at the parish only, secondary sponsors and a required motif', () => {
    const parish = reviewOf('details', { typeOfMarriage: 'Church wedding', venueType: 'parish', candleSponsor: 'A', veilSponsor: 'B', cordSponsor: 'C', motifNotes: 'Classic White' })
    expect(parish).toEqual({ Type: 'Church wedding', Venue: 'St. Peter the Apostle Parish', 'Candle sponsors': 'A', 'Veil sponsors': 'B', 'Cord sponsors': 'C', Motif: 'Classic White' })
  })

  it('refuses a convalidation, another church, a missing motif and a missing 2x2 photo', () => {
    const schema = fullSchema(weddingWizard)
    expect(issueKeys(schema.safeParse({ ...valid, typeOfMarriage: 'Convalidation' }))).toContain('typeOfMarriage')
    expect(issueKeys(schema.safeParse({ ...valid, venueType: 'other' }))).toContain('venueType')
    expect(issueKeys(schema.safeParse({ ...valid, motifNotes: undefined }))).toContain('motifNotes')
    const withoutPhoto = { ...valid }
    delete (withoutPhoto as Record<string, unknown>).groomPhoto
    expect(issueKeys(schema.safeParse(withoutPhoto))).toContain('groomPhoto')
  })

  it('refuses a religion other than Roman Catholic for the groom', () => {
    expect(issueKeys(fullSchema(weddingWizard).safeParse({ ...valid, groomReligion: 'Islam' }))).toContain('groomReligion')
  })

  it('documents: lists the optional follow-up documents when uploaded', () => {
    const r = reviewOf('documents', { ...valid, marriageLicense: '/documents/x/license.pdf' })
    expect(r["Groom's baptismal certificate (for marriage purposes)"]).toBe('✓ Uploaded')
    expect(r['Marriage license or Art. 34 affidavit']).toBe('✓ Uploaded')
    expect(r['Pre-Cana seminar certificate']).toBeUndefined()
  })
})
