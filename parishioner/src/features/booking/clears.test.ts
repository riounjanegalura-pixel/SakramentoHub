import { z } from 'zod'
import { describe, it, expect } from 'vitest'
import { baptismWizard } from './baptism/definition'
import { weddingWizard } from './wedding/definition'
import { anointingWizard } from './anointing/definition'
import { funeralWizard } from './funeral/definition'
import { houseBlessingWizard } from './house-blessing/definition'
import { bookingForStep } from './wizard/BookingForStep'
import type { WizardDefinition } from './wizard/types'
import type { FormValues } from '../../lib/validation/groups'

const clearsOf = (wizard: WizardDefinition, stepId: string, data: FormValues) => {
  const step = wizard.steps.find((s) => s.id === stepId)!
  return step.clears?.(data) ?? []
}

const PLACE = (p: string) => [p, `${p}RegionCode`, `${p}ProvinceCode`, `${p}CityCode`, `${p}BarangayCode`]
const ADDRESS = (p: string) => [...PLACE(p), `${p}Line`]
const PERSON = (p: string) => [`${p}FirstName`, `${p}MiddleName`, `${p}LastName`, `${p}Suffix`, ...PLACE(`${p}PlaceOfBirth`), `${p}Religion`]

describe('clears: baptism', () => {
  it('drops the father details and keeps the reason once the father is left out', () => {
    const keys = clearsOf(baptismWizard, 'parents', { fatherOmitted: true })
    expect(keys).toEqual(expect.arrayContaining(PERSON('father')))
    expect(keys).not.toContain('fatherOmittedReason')
  })

  it('never drops the mother details, even from an older draft that left her out; only the retired answer goes', () => {
    const keys = clearsOf(baptismWizard, 'parents', { fatherOmitted: false, motherOmitted: true })
    expect(keys.some((k) => PERSON('mother').includes(k))).toBe(false)
    expect(keys).toEqual(expect.arrayContaining(['motherOmitted', 'motherOmittedReason']))
  })

  it('keeps every parent answer while the father is included, and never touches the family residence', () => {
    const keys = clearsOf(baptismWizard, 'parents', { fatherOmitted: false })
    expect(keys).toEqual(['fatherOmittedReason', 'motherOmitted', 'motherOmittedReason'])
    expect(keys.some((k) => k.startsWith('parentsResidence'))).toBe(false)
  })

  it('drops the marriage date and place for parents who are not married, and only then', () => {
    expect(clearsOf(baptismWizard, 'marriage', { parentsMarriage: 'not_married' })).toEqual(['parentsMarriageDate', 'parentsMarriagePlace'])
    expect(clearsOf(baptismWizard, 'marriage', { parentsMarriage: 'catholic' })).toEqual([])
    expect(clearsOf(baptismWizard, 'marriage', { parentsMarriage: 'civil' })).toEqual([])
  })
})

describe('clears: wedding', () => {
  it('drops the venue name and address at the parish, keeps them elsewhere', () => {
    expect(clearsOf(weddingWizard, 'details', { venueType: 'parish' })).toEqual(['venueName', 'venueAddress'])
    expect(clearsOf(weddingWizard, 'details', { venueType: 'other' })).toEqual([])
  })
})

describe('clears: anointing', () => {
  it('at home: drops the hospital details, keeps the home address', () => {
    expect(clearsOf(anointingWizard, 'patient', { locationType: 'home' })).toEqual(['hospitalName', 'hospitalRoom'])
  })

  it('in a hospital: drops the whole home address group, keeps the hospital details', () => {
    const keys = clearsOf(anointingWizard, 'patient', { locationType: 'hospital' })
    expect([...keys].sort()).toEqual(ADDRESS('patientAddress').sort())
  })
})

describe('clears: funeral', () => {
  it('a church Mass drops the whole wake address group', () => {
    expect([...clearsOf(funeralWizard, 'mass', { massType: 'church' })].sort()).toEqual(ADDRESS('houseMassAddress').sort())
  })

  it('a house Mass keeps the wake address', () => {
    expect(clearsOf(funeralWizard, 'mass', { massType: 'house' })).toEqual([])
  })
})

describe('clears: house blessing', () => {
  const property = (propertyType: string) => clearsOf(houseBlessingWizard, 'property', { propertyType })

  it('a vehicle drops the property address and description, keeps the plate', () => {
    const keys = property('vehicle')
    expect(keys).toEqual(expect.arrayContaining(ADDRESS('propertyAddress')))
    expect(keys).toContain('propertyDescription')
    expect(keys).not.toContain('vehiclePlate')
  })

  it('a house drops the plate and description, keeps the address', () => {
    expect([...property('house')].sort()).toEqual(['propertyDescription', 'vehiclePlate'])
  })

  it('"other" drops only the plate, keeping the address and description', () => {
    expect(property('other')).toEqual(['vehiclePlate'])
  })
})

describe('clears: booking for', () => {
  const forStep = bookingForStep('baptism')

  it('booking for oneself drops the relationship and what they wrote under "Someone else"', () => {
    expect(forStep.clears?.({ bookingFor: 'self' })).toEqual(['relationship', 'relationshipOther'])
  })

  it('booking for someone else keeps the relationship, and drops the written one unless it is "Someone else"', () => {
    expect(forStep.clears?.({ bookingFor: 'other', relationship: 'child' })).toEqual(['relationshipOther'])
    expect(forStep.clears?.({ bookingFor: 'other', relationship: 'other' })).toEqual([])
  })
})

describe('booking for: "Someone else" asks who they are to you', () => {
  const step = bookingForStep('baptism')
  const check = (data: Record<string, unknown>) => z.object(step.shape).superRefine((d, ctx) => step.refine?.(d, ctx)).safeParse(data)

  it('needs the written relationship when the relationship is "Someone else"', () => {
    const result = check({ bookingFor: 'other', relationship: 'other' })
    expect(result.success).toBe(false)
    expect(!result.success && result.error.issues.map((i) => i.path.join('.'))).toContain('relationshipOther')
  })

  it('accepts it once written, and does not ask for it for a listed relationship', () => {
    expect(check({ bookingFor: 'other', relationship: 'other', relationshipOther: 'Godparent' }).success).toBe(true)
    expect(check({ bookingFor: 'other', relationship: 'child' }).success).toBe(true)
  })
})
