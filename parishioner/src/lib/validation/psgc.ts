import { z } from 'zod'
import type { FieldValues, Path, PathValue, UseFormSetValue, UseFormWatch } from 'react-hook-form'

/**
 * Shape of a place field captured with the cascading PSGC picker.
 *
 * Every place field keeps its original key (e.g. `childPlaceOfBirth`) holding
 * the human-readable place — "Atlag, City of Malolos, Bulacan" — so review
 * screens, certificates and the admin "Form Details" dump read it as plain
 * text. Next to it sit four flat, clearly-named PSGC code keys
 * (`childPlaceOfBirthRegionCode`, `…ProvinceCode`, `…CityCode`,
 * `…BarangayCode`) that make the value filterable and let the picker
 * restore its selections when the parishioner steps back.
 *
 * The code keys are optional: they are empty when the PSGC service was
 * unreachable and the parishioner typed the place by hand instead.
 */
export const PSGC_LEVELS = ['Region', 'Province', 'City', 'Barangay'] as const
export type PsgcLevel = (typeof PSGC_LEVELS)[number]
export type PsgcCodeKey<P extends string> = `${P}${PsgcLevel}Code`

export function psgcCodeKey<P extends string>(prefix: P, level: PsgcLevel): PsgcCodeKey<P> {
  return `${prefix}${level}Code`
}

/** Zod shape for the four PSGC code keys belonging to one place field. */
export function psgcCodeFields<P extends string>(prefix: P) {
  return Object.fromEntries(
    PSGC_LEVELS.map((level) => [psgcCodeKey(prefix, level), z.string().nullish()]),
  ) as { [K in PsgcCodeKey<P>]: z.ZodOptional<z.ZodNullable<z.ZodString>> }
}

/** What the cascading picker reads and writes for one place field. */
export interface PsgcPlaceValue {
  /** Human-readable place; empty until at least a city/municipality is chosen. */
  display: string
  regionCode: string
  /** Empty for cities that belong to no province (all of NCR, Isabela City, Cotabato City). */
  provinceCode: string
  cityCode: string
  barangayCode: string
}

/**
 * Wires a `CascadingAddressPicker` to a react-hook-form form: reads the
 * readable key plus its four code keys, and writes all five back on change.
 * The readable key is the one the step's Zod schema validates.
 */
export function bindPsgcField<T extends FieldValues>(
  form: { watch: UseFormWatch<T>; setValue: UseFormSetValue<T> },
  name: Path<T> & string,
): { value: PsgcPlaceValue; onChange: (next: PsgcPlaceValue) => void } {
  const read = (key: string) => (form.watch(key as Path<T>) as string | undefined) ?? ''
  const write = (key: string, v: string, shouldValidate = false) =>
    form.setValue(key as Path<T>, v as PathValue<T, Path<T>>, { shouldDirty: true, shouldValidate })

  return {
    value: {
      display: read(name),
      regionCode: read(psgcCodeKey(name, 'Region')),
      provinceCode: read(psgcCodeKey(name, 'Province')),
      cityCode: read(psgcCodeKey(name, 'City')),
      barangayCode: read(psgcCodeKey(name, 'Barangay')),
    },
    onChange: (next) => {
      write(psgcCodeKey(name, 'Region'), next.regionCode)
      write(psgcCodeKey(name, 'Province'), next.provinceCode)
      write(psgcCodeKey(name, 'City'), next.cityCode)
      write(psgcCodeKey(name, 'Barangay'), next.barangayCode)
      // Re-validate only once there's something to accept, so picking a
      // region doesn't flash a "required" error before the city is chosen.
      write(name, next.display, next.display !== '')
    },
  }
}
