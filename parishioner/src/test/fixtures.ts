/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { addDaysYmd, parishToday } from '../lib/domain'

// Vitest runs from parishioner/; import.meta.url is not a file: URL under jsdom, so resolve from cwd.
const ROOT = resolve(process.cwd(), '../contracts/fixtures')

export interface Fixture {
  name: string
  formData: Record<string, unknown>
  expectErrorKey?: string
}

/** {TODAY-5} / {TODAY+2} in a fixture become that many days from today (parish time), so date windows never go stale. */
function relativeDates(json: string): string {
  return json.replace(/\{TODAY([+-]\d+)\}/g, (_m, n: string) => addDaysYmd(parishToday(), Number(n)))
}

/** Shared server/client fixtures (see contracts/fixtures/README.md). */
export function loadFixtures(sacrament: string): Fixture[] {
  const dir = join(ROOT, sacrament)
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    throw new Error(`No fixtures directory for "${sacrament}" at ${dir}`)
  }
  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const json = JSON.parse(relativeDates(readFileSync(join(dir, f), 'utf8').replaceAll('{OWNER}', '00000000-0000-0000-0000-000000000000')))
      if (json.formData === undefined || json.formData === null) {
        throw new Error(`Fixture ${sacrament}/${f} has no formData`)
      }
      return { name: f.replace('.json', ''), formData: json.formData, expectErrorKey: json.expectErrorKey }
    })
}

export function issueKeys(result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }): string[] {
  return result.success ? [] : (result.error?.issues ?? []).map((i) => i.path.map(String).join('.'))
}
