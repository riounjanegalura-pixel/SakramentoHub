import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// WCAG 2.2 AA guard for the colour tokens. Text needs 4.5:1 (1.4.3); the edge of an input and the focus ring
// need 3:1 (1.4.11). A pair that fails here fails a client's accessibility check, so change the colour, not the test.
const css = readFileSync(join(__dirname, 'globals.css'), 'utf8')
const token = (name: string): string => {
  const m = css.match(new RegExp(`--${name}: *#([0-9A-Fa-f]{6})`))
  if (!m) throw new Error(`token --${name} not found as a 6-digit hex`)
  return m[1]
}
const channel = (hex: string, i: number) => {
  const v = parseInt(hex.slice(i, i + 2), 16) / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 2) + 0.0722 * channel(hex, 4)
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT: Array<[string, string]> = [
  ['ink', 'paper'], ['ink', 'surface'], ['ink-muted', 'paper'], ['ink-muted', 'surface'], ['ink-muted', 'paper-deep'],
  ['ink-muted', 'line'], ['navy', 'paper'], ['navy', 'surface'], ['surface', 'navy'], ['surface', 'navy-deep'],
  ['on-navy', 'navy'], ['on-navy', 'navy-deep'], ['gold-text', 'paper'], ['gold-text', 'surface'], ['gold', 'navy'],
  ['status-pending-fg', 'status-pending-bg'], ['status-confirmed-fg', 'status-confirmed-bg'],
  ['status-rejected-fg', 'status-rejected-bg'], ['status-done-fg', 'status-done-bg'],
  ['danger', 'surface'], ['danger', 'paper'], ['surface', 'danger'],
]
const UI: Array<[string, string]> = [['input-border', 'surface'], ['input-border', 'paper'], ['focus', 'paper'], ['focus', 'surface']]

describe('colour tokens meet WCAG AA', () => {
  it.each(TEXT)('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
  it.each(UI)('%s against %s is at least 3:1', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3)
  })
})
