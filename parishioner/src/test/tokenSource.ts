import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vitest'

/** The source file of a screen uses design tokens only: no raw hex, no legacy `brand-*`, no animate or transition classes. */
export function expectTokenOnlySource(dir: string, file: string): void {
  const source = readFileSync(join(dir, file), 'utf8')
  expect(source, `${file}: raw hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  expect(source, `${file}: legacy brand- class`).not.toMatch(/brand-/)
  expect(source, `${file}: animate/transition class`).not.toMatch(/\b(animate|transition)-/)
  expect(source, `${file}: raw palette colour`).not.toMatch(/\b(?:text|bg|border)-(?:red|green|amber|gray|blue)-\d/)
}
