/**
 * Philippine Standard Geographic Code (PSGC) lookups for the cascading
 * Region → Province → City/Municipality → Barangay picker.
 *
 * Source: the community-hosted static PSGC API at psgc.gitlab.io (plain JSON
 * files, CORS `*`, no key, no rate limit). It is a third-party host, so
 * callers must treat every request as fallible — the picker drops back to a
 * free-text input when any of these reject, rather than blocking the form.
 */
export const PSGC_BASE_URL = 'https://psgc.gitlab.io/api'

/** Region III – Central Luzon, the only region the priest travels to for house visits. */
export const REGION_III_CODE = '030000000'

/** Bulacan, the parish's province (the parish is in Balagtas). */
export const BULACAN_PROVINCE_CODE = '031400000'

/** The two towns a house blessing is offered in: Balagtas, and its neighbour Bulakan. */
export const BLESSING_CITY_CODES = ['031402000', '031405000']

/** PSGC spells the municipality "Bulacan", the same as its province; the town is written Bulakan. */
export function townName(name: string, provinceCode: string | false): string {
  return name === 'Bulacan' && provinceCode === BULACAN_PROVINCE_CODE ? 'Bulakan' : name
}

export interface PsgcRegion {
  code: string
  /** e.g. "Central Luzon" */
  name: string
  /** e.g. "Region III" — what parishioners usually call it. */
  regionName: string
}

export interface PsgcProvince {
  code: string
  name: string
}

export interface PsgcCity {
  code: string
  name: string
  /** `false` for cities outside any province (all of NCR, Isabela City, Cotabato City). */
  provinceCode: string | false
}

export interface PsgcBarangay {
  code: string
  name: string
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${PSGC_BASE_URL}${path}`)
  if (!res.ok) throw new Error(`PSGC request failed (${res.status})`)
  return (await res.json()) as T
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

export async function fetchRegions(): Promise<PsgcRegion[]> {
  const rows = await getJson<PsgcRegion[]>('/regions.json')
  // Code order is the official Region I, II, III… order, which is how
  // people look for their region — alphabetical would scatter them.
  return rows
    .map(({ code, name, regionName }) => ({ code, name, regionName }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

export async function fetchProvinces(regionCode: string): Promise<PsgcProvince[]> {
  const rows = await getJson<PsgcProvince[]>(`/regions/${regionCode}/provinces.json`)
  return rows.map(({ code, name }) => ({ code, name })).sort(byName)
}

/**
 * Every city/municipality in the region in one request. Filtering by
 * province happens client-side, which also catches the handful of cities
 * that belong to no province at all.
 */
export async function fetchRegionCities(regionCode: string): Promise<PsgcCity[]> {
  const rows = await getJson<PsgcCity[]>(`/regions/${regionCode}/cities-municipalities.json`)
  return rows.map(({ code, name, provinceCode }) => ({ code, name: townName(name, provinceCode), provinceCode })).sort(byName)
}

export async function fetchBarangays(cityCode: string): Promise<PsgcBarangay[]> {
  const rows = await getJson<PsgcBarangay[]>(`/cities-municipalities/${cityCode}/barangays.json`)
  return rows.map(({ code, name }) => ({ code, name })).sort(byName)
}
