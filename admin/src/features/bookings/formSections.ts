import type { Sacrament } from '../../lib/types'

export interface SectionDef {
  title: string
  match: (key: string) => boolean
}

export const OTHER_SECTION = 'Other details'

const keys = (...names: string[]) => (key: string) => names.includes(key)
const prefix = (...ps: string[]) => (key: string) => ps.some((p) => key.startsWith(p))
const any = (...tests: Array<(key: string) => boolean>) => (key: string) => tests.some((t) => t(key))

const people = (who: string, label: string): SectionDef[] => [
  { title: label, match: (k) => k.startsWith(who) && !/^(father|mother)/i.test(k.slice(who.length)) },
  { title: `${label}'s parents`, match: (k) => /^(father|mother)/i.test(k.slice(who.length)) && k.startsWith(who) },
]

const SPONSORS: SectionDef = { title: 'Sponsors', match: keys('sponsors') }
const BOOKING: SectionDef = { title: 'Booking', match: keys('bookingFor', 'relationship', 'scheduleType') }

/** First matching section wins; display order is array order. */
export const SECTIONS: Record<Sacrament, SectionDef[]> = {
  baptism: [
    { title: 'Child', match: prefix('child') },
    { title: 'Father', match: prefix('father') },
    { title: 'Mother', match: prefix('mother') },
    { title: "Parents' residence and marriage", match: prefix('parents') },
    SPONSORS,
    BOOKING,
  ],
  confirmation: [
    { title: 'Confirmand', match: prefix('confirmand') },
    { title: 'Father', match: prefix('father') },
    { title: 'Mother', match: prefix('mother') },
    { title: 'Baptism', match: prefix('baptism') },
    SPONSORS,
    BOOKING,
  ],
  wedding: [
    ...people('groom', 'Groom'),
    ...people('bride', 'Bride'),
    { title: 'Wedding', match: any(keys('typeOfMarriage', 'candleSponsor', 'motifNotes'), prefix('venue')) },
    SPONSORS,
    BOOKING,
  ],
  funeral: [
    { title: 'Deceased', match: prefix('deceased') },
    { title: 'Burial', match: prefix('burial') },
    { title: 'Mass', match: any(keys('massType', 'intention'), prefix('houseMass')) },
    BOOKING,
  ],
  anointing: [
    { title: 'Patient', match: prefix('patient') },
    { title: 'Location', match: any(keys('locationType'), prefix('hospital', 'home')) },
    { title: 'Urgency', match: keys('inDangerOfDeath') },
    BOOKING,
  ],
  'house-blessing': [
    { title: 'Property', match: any(prefix('property', 'vehicle', 'business'), keys('occasion')) },
    BOOKING,
  ],
}

/** Splits `fieldKeys` into the sacrament's sections, in display order, plus Other details. Empty sections are dropped. */
export function groupFields(sacrament: Sacrament, fieldKeys: string[]): Array<{ title: string; keys: string[] }> {
  const defs = SECTIONS[sacrament]
  const buckets = defs.map((d) => ({ title: d.title, keys: [] as string[] }))
  const other: string[] = []
  for (const key of fieldKeys) {
    const index = defs.findIndex((d) => d.match(key))
    if (index === -1) other.push(key)
    else buckets[index].keys.push(key)
  }
  return [...buckets, { title: OTHER_SECTION, keys: other }].filter((b) => b.keys.length > 0)
}

const SEX = { male: 'Male', female: 'Female' }
const CIVIL_STATUS = { single: 'Single', married: 'Married', widowed: 'Widowed', annulled: 'Annulled', separated: 'Legally separated' }

/** The only fields whose stored values are codes. Everything else is shown as typed. */
export const ENUM_FIELDS: Array<{ match: (key: string) => boolean; labels: Record<string, string> }> = [
  { match: keys('bookingFor'), labels: { self: 'Myself', other: 'Someone else' } },
  { match: keys('relationship'), labels: { child: 'My child', parent: 'My parent', spouse: 'My spouse', sibling: 'My sibling', relative: 'A relative', other: 'Someone else' } },
  { match: keys('scheduleType'), labels: { regular: 'Regular session', special: 'Special schedule' } },
  { match: keys('parentsMarriage'), labels: { catholic: 'Catholic', civil: 'Civil', not_married: 'Not married' } },
  { match: keys('massType'), labels: { church: 'In church', house: 'At the house' } },
  { match: keys('locationType'), labels: { home: 'At home', hospital: 'In a hospital' } },
  { match: keys('propertyType'), labels: { house: 'House', business: 'Business', vehicle: 'Vehicle', other: 'Other' } },
  { match: keys('venueType'), labels: { parish: 'In the parish', other: 'Elsewhere' } },
  { match: (k) => k.endsWith('Sex'), labels: SEX },
  { match: (k) => k.endsWith('CivilStatus'), labels: CIVIL_STATUS },
]

/** The label for a coded value of an enum field, or null when the field is free text or the value is unknown. */
export function enumLabel(key: string, value: unknown): string | null {
  if (typeof value !== 'string') return null
  const field = ENUM_FIELDS.find((f) => f.match(key))
  return field?.labels[value] ?? null
}
