import { describe, expect, it } from 'vitest'
import type { User } from '../../../lib/types'
import { addressFromProfile, civilStatusFromProfile, parentFromProfile } from './profilePrefill'
import { splitName } from './review'

const user: User = {
  id: '1', fullName: 'Maria Santos', email: 'm@x.com', phone: '09171234567', address: '',
  civilStatus: 'single', sex: 'female', addressLine: '12 Rizal St',
  addressPsgc: { display: 'Atlag, City of Malolos, Bulacan', regionCode: '03', provinceCode: '0314', cityCode: '031410', barangayCode: '031410001' },
}

describe('profile prefill', () => {
  it('maps the home address onto any address group, codes and street line included', () => {
    expect(addressFromProfile(user, 'propertyAddress')).toEqual({
      propertyAddress: 'Atlag, City of Malolos, Bulacan',
      propertyAddressRegionCode: '03', propertyAddressProvinceCode: '0314',
      propertyAddressCityCode: '031410', propertyAddressBarangayCode: '031410001',
      propertyAddressLine: '12 Rizal St',
    })
  })

  it('returns nothing when the profile has no address', () => {
    expect(addressFromProfile({ ...user, addressPsgc: null, addressLine: null }, 'x')).toEqual({})
  })

  it('offers a civil status only when the form has that choice', () => {
    expect(civilStatusFromProfile(user, ['single', 'widowed'])).toBe('single')
    expect(civilStatusFromProfile({ ...user, civilStatus: 'married' }, ['single', 'widowed'])).toBeUndefined()
  })

  it('fills a parent from the account, with the family residence', () => {
    const v = parentFromProfile(user, 'mother', splitName)
    expect(v.motherFirstName).toBe('Maria')
    expect(v.motherLastName).toBe('Santos')
    expect(v.parentsResidence).toBe('Atlag, City of Malolos, Bulacan')
  })
})
