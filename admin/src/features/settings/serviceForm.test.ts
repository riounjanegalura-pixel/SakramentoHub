import { describe, expect, it } from 'vitest'
import { toForm, toPayload } from './serviceForm'
import type { AdminService } from '../../lib/types'

const baptism: AdminService = {
  id: 'baptism', name: 'Baptism', description: 'Sunday baptism', feeRule: 'per_sponsor', priceCentavos: 5000, durationMinutes: 45,
  offsite: false, allowedWeekdays: [2, 3, 4, 5, 6], leadTimeDays: 7, dailyCapacity: null, hasSessions: true,
  sessionWeekdays: [7], sessionTimes: ['10:00'], sessionCapacity: 10, sessionDurationMinutes: 60, sponsorFeeAllowed: true,
}
const funeral: AdminService = {
  ...baptism, id: 'funeral', name: 'Funeral Mass', feeRule: 'none', priceCentavos: null, hasSessions: false,
  sessionWeekdays: null, sessionTimes: null, sessionCapacity: null, sessionDurationMinutes: null, sponsorFeeAllowed: false,
}

describe('serviceForm', () => {
  it('turns a service into input strings', () => {
    expect(toForm(baptism)).toMatchObject({ price: '50.00', durationMinutes: '45', leadTimeDays: '7', dailyCapacity: '', sessionTimes: '10:00', sessionCapacity: '10' })
    expect(toForm(funeral)).toMatchObject({ price: '', sessionTimes: '' })
  })

  it('sends nothing when nothing changed', () => {
    expect(toPayload(toForm(baptism), toForm(baptism), true)).toEqual({})
  })

  it('sends only the keys that changed', () => {
    const base = toForm(baptism)
    expect(toPayload(base, { ...base, leadTimeDays: '3', name: ' Baptism ' }, true)).toEqual({ leadTimeDays: 3 })
    expect(toPayload(base, { ...base, allowedWeekdays: [2, 3, 4, 5] }, true)).toEqual({ allowedWeekdays: [2, 3, 4, 5] })
    expect(toPayload(base, { ...base, dailyCapacity: '12' }, true)).toEqual({ dailyCapacity: 12 })
    expect(toPayload({ ...base, dailyCapacity: '12' }, { ...base, dailyCapacity: ' ' }, true)).toEqual({ dailyCapacity: null })
    expect(toPayload(base, { ...base, description: '  ' }, true)).toEqual({ description: null })
  })

  it('converts pesos to centavos and compares prices numerically', () => {
    const base = toForm(baptism)
    expect(toPayload(base, { ...base, price: '75.5' }, true)).toEqual({ priceCentavos: 7550 })
    expect(toPayload(base, { ...base, price: '50' }, true)).toEqual({}) // 50 === 50.00
  })

  it('sends the price with a new fee rule and no price when the fee is removed', () => {
    const base = toForm(funeral)
    expect(toPayload(base, { ...base, feeRule: 'flat', price: '1000' }, false)).toEqual({ feeRule: 'flat', priceCentavos: 100000 })
    const flat = toForm({ ...funeral, feeRule: 'flat', priceCentavos: 100000 })
    expect(toPayload(flat, { ...flat, feeRule: 'none', price: '1000.00' }, false)).toEqual({ feeRule: 'none' })
  })

  it('parses session fields only for a service that has sessions', () => {
    const base = toForm(baptism)
    const edited = { ...base, sessionTimes: '09:00, 11:00 ,', sessionCapacity: '12', sessionWeekdays: [6, 7], sessionDurationMinutes: '90' }
    expect(toPayload(base, edited, true)).toEqual({ sessionTimes: ['09:00', '11:00'], sessionCapacity: 12, sessionWeekdays: [6, 7], sessionDurationMinutes: 90 })
    expect(toPayload(base, edited, false)).toEqual({})
  })
})
