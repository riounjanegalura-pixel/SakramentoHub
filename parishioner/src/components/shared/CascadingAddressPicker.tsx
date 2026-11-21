import { useEffect, useState, type ChangeEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchBarangays,
  fetchProvinces,
  fetchRegionCities,
  fetchRegions,
  type PsgcRegion,
} from '../../lib/api/psgc'
import type { PsgcPlaceValue } from '../../lib/validation/psgc'
import { useFieldErrorRole } from '../ui/field'

interface CascadingAddressPickerProps {
  /** Base id; each select gets `${id}-region`, `${id}-province`, … */
  id: string
  label: string
  required?: boolean
  error?: string
  value: PsgcPlaceValue
  onChange: (next: PsgcPlaceValue) => void
  /** Offer only these regions (PSGC codes). Omit to offer every region. */
  regionCodes?: string[]
  /** Preset the region and province and hide both selects: the parishioner only picks the town and barangay. */
  fixedPlace?: { regionCode: string; provinceCode: string }
  /** With `fixedPlace`, offer only these towns (PSGC city codes). */
  cityCodes?: string[]
}

/** Province-select option for the few cities that sit outside any province. */
const INDEPENDENT = '__independent__'

// PSGC data changes a few times a year at most — fetch each list once per
// session so stepping back and forth through the wizard never re-fetches.
const forever = { staleTime: Infinity, gcTime: Infinity } as const

const selectClass =
  'w-full rounded-lg border border-input-border bg-surface p-3 disabled:cursor-not-allowed disabled:opacity-60'

function regionLabel(r: PsgcRegion) {
  return r.regionName === r.name ? r.name : `${r.regionName} – ${r.name}`
}

/**
 * Structured place picker following the official PSGC hierarchy:
 * Region → Province → City/Municipality → Barangay. Each select stays
 * disabled until its parent is chosen; choosing a parent clears its
 * children. A City/Municipality is the minimum for a usable value —
 * `display` stays empty until one is picked; Barangay is optional.
 *
 * If the PSGC service can't be reached, it degrades to a single free-text
 * input (same look as FormField) so the booking is never blocked.
 */
export function CascadingAddressPicker({
  id,
  label,
  required,
  error,
  value,
  onChange,
  regionCodes,
  fixedPlace,
  cityCodes,
}: CascadingAddressPickerProps) {
  const errorRole = useFieldErrorRole()
  const { cityCode, barangayCode } = value
  const regionCode = fixedPlace?.regionCode ?? value.regionCode
  const provinceCode = fixedPlace?.provinceCode ?? value.provinceCode
  const [independent, setIndependent] = useState(!!cityCode && !provinceCode)

  const regionsQ = useQuery({ queryKey: ['psgc', 'regions'], queryFn: fetchRegions, ...forever })
  const provincesQ = useQuery({
    queryKey: ['psgc', 'provinces', regionCode],
    queryFn: () => fetchProvinces(regionCode),
    enabled: !!regionCode,
    ...forever,
  })
  const citiesQ = useQuery({
    queryKey: ['psgc', 'cities', regionCode],
    queryFn: () => fetchRegionCities(regionCode),
    enabled: !!regionCode,
    ...forever,
  })
  const barangaysQ = useQuery({
    queryKey: ['psgc', 'barangays', cityCode],
    queryFn: () => fetchBarangays(cityCode),
    enabled: !!cityCode,
    ...forever,
  })

  // A preset place writes its region and province codes once; whatever was already chosen is kept.
  const presetMissing = !!fixedPlace && (value.regionCode !== fixedPlace.regionCode || value.provinceCode !== fixedPlace.provinceCode)
  useEffect(() => {
    if (presetMissing && fixedPlace) onChange({ ...value, regionCode: fixedPlace.regionCode, provinceCode: fixedPlace.provinceCode })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetMissing])

  const failedQueries = [regionsQ, provincesQ, citiesQ, barangaysQ].filter((q) => q.isError)

  const regions = (regionsQ.data ?? []).filter((r) => !regionCodes || regionCodes.includes(r.code))
  const provinces = provincesQ.data ?? []
  const allCities = citiesQ.data ?? []
  const barangays = barangaysQ.data ?? []

  // NCR has no provinces at all; a couple of other regions have one or two
  // province-less cities, offered as an extra "province" option.
  const regionHasNoProvinces = provincesQ.isSuccess && provinces.length === 0
  const hasIndependentCities = allCities.some((c) => c.provinceCode === false)
  const provinceSelectValue = provinceCode || (independent && !regionHasNoProvinces ? INDEPENDENT : '')
  const placeCities = regionHasNoProvinces
    ? allCities
    : provinceSelectValue === INDEPENDENT
      ? allCities.filter((c) => c.provinceCode === false)
      : provinceCode
        ? allCities.filter((c) => c.provinceCode === provinceCode)
        : []
  const cities = fixedPlace && cityCodes ? placeCities.filter((c) => cityCodes.includes(c.code)) : placeCities
  const cityEnabled = !!fixedPlace || regionHasNoProvinces || !!provinceSelectValue

  function emit(next: Omit<PsgcPlaceValue, 'display'>) {
    let display = ''
    // When the place is required, the barangay must be chosen too (only house no. / street is optional).
    if (next.cityCode && (!required || next.barangayCode)) {
      const region = regions.find((r) => r.code === next.regionCode)
      const province = provinces.find((p) => p.code === next.provinceCode)
      const city = allCities.find((c) => c.code === next.cityCode)
      const barangay = barangays.find((b) => b.code === next.barangayCode)
      display = [barangay?.name, city?.name, province?.name ?? region?.name]
        .filter(Boolean)
        .join(', ')
    }
    onChange({ ...next, display })
  }

  if (failedQueries.length > 0) {
    return (
      <div className="mb-4">
        <label htmlFor={id} className="mb-1 flex flex-wrap items-baseline gap-2 text-sm font-medium text-ink">
          <span>{label}</span> {required && <span className="text-label font-normal text-ink-muted">Required</span>}
        </label>
        <input
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-h-[44px] w-full rounded-xl border border-input-border bg-surface px-3 py-2 text-base text-ink aria-invalid:border-danger md:text-sm"
          placeholder="City/Municipality, Province"
          value={value.display}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange({
              display: e.target.value,
              regionCode: '',
              provinceCode: '',
              cityCode: '',
              barangayCode: '',
            })
          }
        />
        <p className="mt-1 text-label text-ink-muted">
          Couldn&apos;t load the list of places. Type it instead, or{' '}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => failedQueries.forEach((q) => void q.refetch())}
          >
            try again
          </button>
          .
        </p>
        {error && (
          <p id={`${id}-error`} role={errorRole} className="mt-1 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    )
  }

  const placeholder = (parentChosen: boolean, parentName: string, loading: boolean, what: string) =>
    !parentChosen ? `Select a ${parentName} first` : loading ? 'Loading…' : `Select ${what}`

  return (
    <fieldset className="mb-4" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-1 flex flex-wrap items-baseline gap-2 text-sm font-medium text-ink">
        <span>{label}</span> {required && <span className="text-label font-normal text-ink-muted">Required</span>}
      </legend>

      {value.display && !regionCode && (
        <p className="mb-2 text-label text-ink-muted">
          Saved as &ldquo;{value.display}&rdquo;. Pick from the lists below to change it.
        </p>
      )}

      <div data-address-grid className="grid gap-2">
        {!fixedPlace && (
          <>
        <div>
              <label htmlFor={`${id}-region`} className="mb-1 block text-label text-ink-muted">
                Region
              </label>
              <select
                id={`${id}-region`}
                className={selectClass}
                value={regionCode}
                aria-invalid={!!error && !regionCode}
                disabled={regionsQ.isPending}
                onChange={(e) => {
                  setIndependent(false)
                  emit({ regionCode: e.target.value, provinceCode: '', cityCode: '', barangayCode: '' })
                }}
              >
                <option value="">{regionsQ.isPending ? 'Loading…' : 'Select region'}</option>
                {regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {regionLabel(r)}
                  </option>
                ))}
              </select>
            </div>
    
            <div>
              <label htmlFor={`${id}-province`} className="mb-1 block text-label text-ink-muted">
                Province
              </label>
              <select
                id={`${id}-province`}
                className={selectClass}
                value={provinceSelectValue}
                disabled={!regionCode || provincesQ.isPending || regionHasNoProvinces}
                onChange={(e) => {
                  const v = e.target.value
                  setIndependent(v === INDEPENDENT)
                  emit({
                    regionCode,
                    provinceCode: v === INDEPENDENT ? '' : v,
                    cityCode: '',
                    barangayCode: '',
                  })
                }}
              >
                <option value="">
                  {regionHasNoProvinces
                    ? 'None — this region has no provinces'
                    : placeholder(!!regionCode, 'region', provincesQ.isPending, 'province')}
                </option>
                {provinces.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
                {hasIndependentCities && !regionHasNoProvinces && (
                  <option value={INDEPENDENT}>Independent city (no province)</option>
                )}
              </select>
            </div>
    
          </>
        )}
        <div>
          <label htmlFor={`${id}-city`} className="mb-1 block text-label text-ink-muted">
            City / Municipality
          </label>
          <select
            id={`${id}-city`}
            className={selectClass}
            value={cityCode}
            aria-invalid={!!error && !!regionCode && !cityCode}
            disabled={!cityEnabled || citiesQ.isPending}
            onChange={(e) =>
              emit({ regionCode, provinceCode, cityCode: e.target.value, barangayCode: '' })
            }
          >
            <option value="">
              {placeholder(cityEnabled, 'province', citiesQ.isPending, 'city / municipality')}
            </option>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-barangay`} className="mb-1 block text-label text-ink-muted">
            {required ? 'Barangay' : 'Barangay (optional)'}
          </label>
          <select
            id={`${id}-barangay`}
            className={selectClass}
            value={barangayCode}
            disabled={!cityCode || barangaysQ.isPending}
            onChange={(e) =>
              emit({ regionCode, provinceCode, cityCode, barangayCode: e.target.value })
            }
          >
            <option value="">
              {placeholder(!!cityCode, 'city / municipality', barangaysQ.isPending, 'barangay')}
            </option>
            {barangays.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p id={`${id}-error`} role={errorRole} className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}
