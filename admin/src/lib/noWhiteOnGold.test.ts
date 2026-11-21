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

const offenders = (test: (cls: string) => boolean) =>
  files(srcDir).flatMap((f) => literals(readFileSync(f, 'utf8')).filter(test).map((cls) => `${relative(srcDir, f).split(sep).join('/')}: ${cls.slice(0, 90)}`))

describe('contrast pairs on filled surfaces', () => {
  it('never puts white text on a gold fill (2.1:1); gold carries navy text, navy carries white', () => {
    expect(offenders((cls) => /(?<![\w:-])(?:bg-gold|bg-brand-gold|bg-gold-press)(?![\w/-])/.test(cls) && /(?<![\w:-])text-white(?![\w-])/.test(cls))).toEqual([])
  })

  it('never puts navy text on a navy fill', () => {
    expect(offenders((cls) => /(?<![\w:-])bg-navy(?![\w/-])/.test(cls) && /(?<![\w:-])text-(?:navy|ink|ink-muted)(?![\w-])/.test(cls))).toEqual([])
  })
})
