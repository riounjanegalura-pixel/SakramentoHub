import { describe, expect, it } from 'vitest'
import { daysText, feeText, leadText, requirementText, servicesCountText } from './serviceText'

describe('leadText', () => {
  it('gives null for no lead time and the plural otherwise', () => {
    expect(leadText(svc({ leadTimeDays: 0 }))).toBeNull()
    expect(leadText(svc({ leadTimeDays: 1 }))).toBe('Book at least 1 day ahead')
    expect(leadText(svc({ leadTimeDays: 14 }))).toBe('Book at least 14 days ahead')
  })
})

describe('servicesCountText', () => {
  it('uses the singular for one service', () => {
    expect(servicesCountText(1)).toBe('1 service available')
    expect(servicesCountText(3)).toBe('3 services available')
  })
})
import { peso } from '../../lib/domain'
import type { RequirementDocument, Service } from '../../lib/types'

const svc = (over: Partial<Service>) =>
  ({ allowedWeekdays: [], sessionWeekdays: null, sessionTimes: null, feeRule: 'flat', priceCentavos: 10000, ...over }) as Service
const doc = (over: Partial<RequirementDocument>) => ({ requirement: 'optional', condition: null, ...over }) as RequirementDocument

describe('feeText', () => {
  it('says No fee for none, null and zero', () => {
    expect(feeText(svc({ feeRule: 'none' }))).toBe('No fee')
    expect(feeText(svc({ priceCentavos: null }))).toBe('No fee')
    expect(feeText(svc({ priceCentavos: 0 }))).toBe('No fee')
  })
  it('gives the flat and per sponsor prices', () => {
    expect(feeText(svc({}))).toBe(peso(10000))
    expect(feeText(svc({ feeRule: 'per_sponsor' }))).toBe(`${peso(10000)} per sponsor`)
  })
})

describe('daysText', () => {
  it('joins weekday names and appends the group session', () => {
    expect(daysText(svc({ allowedWeekdays: [3, 1] }))).toBe('Monday, Wednesday')
    expect(daysText(svc({ allowedWeekdays: [2], sessionWeekdays: [7], sessionTimes: ['10:00'] }))).toBe('Tuesday. Group session on Sunday at 10:00 AM')
  })
  it('is null when nothing is offered', () => {
    expect(daysText(svc({}))).toBeNull()
  })
})

describe('requirementText', () => {
  it('words required, conditional and optional', () => {
    expect(requirementText(doc({ requirement: 'required' }))).toBe('Required')
    expect(requirementText(doc({ requirement: 'conditional', condition: 'If married' }))).toBe('If married')
    expect(requirementText(doc({ requirement: 'conditional' }))).toBe('Required in some cases')
    expect(requirementText(doc({}))).toBe('Optional')
  })
})
