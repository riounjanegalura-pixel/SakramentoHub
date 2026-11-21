import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, 'globals.css'), 'utf8')
const printBlock = css.slice(css.indexOf('@media print'))

describe('print stylesheet', () => {
  it('prints only the day pass', () => {
    expect(printBlock).toMatch(/body \*\s*\{\s*visibility:\s*hidden/)
    expect(printBlock).toMatch(/\.day-pass,\s*\.day-pass \*\s*\{\s*visibility:\s*visible/)
  })

  // Hidden content still takes its height, so without this the pass was followed by blank pages
  // (one for a baptism, several for a wedding's long detail screen).
  it('cuts the page to the pass, so the hidden rest of the screen does not print as blank pages', () => {
    expect(printBlock).toMatch(/html,\s*body\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/)
  })
})
