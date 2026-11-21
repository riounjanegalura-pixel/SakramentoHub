import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = join(import.meta.dirname, '..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : []
  })
}

/** Every quoted or template string in a source file: a class list can sit in className, cn(), cva() or a constant. */
function literals(src: string): string[] {
  return [...src.matchAll(/(['"`])((?:\.|(?!\1)[^\\n])*)\1/g)].map((m) => m[2])
}

const GOLD_FILL = /(?<![\w:-])(?:bg-gold|bg-brand-gold|bg-gold-press|bg-primary)(?![\w/-])/
const NAVY_FILL = /(?<![\w:-])bg-navy(?![\w/-])/

describe('contrast pairs on filled surfaces', () => {
  const offenders = (test: (cls: string) => boolean) =>
    files(srcDir)
      .flatMap((f) => literals(readFileSync(f, 'utf8')).filter(test).map((cls) => `${relative(srcDir, f).split(sep).join('/')}: ${cls.slice(0, 90)}`))

  it('never puts white text on a gold fill (2.1:1)', () => {
    // bg-primary is navy now, so it is excluded from the gold rule; the shadcn kit maps it to navy with white text.
    expect(offenders((cls) => /(?<![\w:-])(?:bg-gold|bg-brand-gold|bg-gold-press)(?![\w/-])/.test(cls) && /(?<![\w:-])text-white(?![\w-])/.test(cls))).toEqual([])
  })

  it('never puts navy text on a navy fill', () => {
    expect(offenders((cls) => NAVY_FILL.test(cls) && /(?<![\w:-])text-(?:navy|ink|ink-muted)(?![\w-])/.test(cls))).toEqual([])
  })

  it('never fills a button with gold: gold is decoration, the action colour is navy', () => {
    // The only gold fills allowed are the brand mark tiles, which are not buttons.
    const bad = offenders((cls) => GOLD_FILL.test(cls) && /(?<![\w:-])(?:py-\d|min-h-|rounded-xl|rounded-full)/.test(cls) && !/size-\[?\d/.test(cls) && !/(?<![\w:-])bg-primary/.test(cls))
    expect(bad).toEqual([])
  })

  it('does not mark a selected or active state with gold alone', () => {
    expect(offenders((cls) => /(?<![\w:-])(?:border-gold|ring-gold|outline-gold)(?![\w-])/.test(cls))).toEqual([])
  })
})
