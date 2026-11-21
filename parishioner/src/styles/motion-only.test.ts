import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Motion goes through motion/react only. Allowed: animate-spin (loading icon),
// a setTimeout marked `// debounce` where it truly is a debounce, and a
// setTimeout marked `// timer: <why>` where it is a non-animation timer
// (deadline, notice delay, cleanup). Every marker is reviewed by hand.
const BANNED = [
  /@keyframes/,
  /\banimate-(?!spin\b)[a-z-]+/,
  /\btransition-[a-z]+/,
  /requestAnimationFrame\(/,
  /setTimeout\((?![^\n]*\/\/ (?:debounce|timer: ))/,
  /setInterval\((?![^\n]*\/\/ (?:debounce|timer: ))/,
  /\b(?:animate|transition)-\[/,
  /["'`\s](?:duration|ease|delay)-(?:\d|\[|in\b|out\b|linear\b)/,
]

/** The bare `transition` utility in a class list (a `transition=` prop or `transition:` key is motion/react). Comments are skipped. */
const BARE_TRANSITION = /["'`\s]transition(?=["'`\s])/
const isComment = (line: string) => /^\s*(?:\/\/|\/\*|\*)/.test(line)

/** Declarations in .css: a CSS transition or animation is not motion/react. */
const CSS_BANNED = [/^\s*(?:transition|animation)(?:-[a-z-]+)?\s*:(?!\s*none\b)/]
/** The app mounts <LazyMotion strict>: components must be `m.*` from motion/react-m, not the full `motion.*`. */
const FULL_MOTION_IMPORT = /import\s*\{[^}]*\bmotion\b[^}]*\}\s*from\s*'motion\/react'/

const SRC = join(__dirname, '..')
const MOTION_LIB = join(SRC, 'lib', 'motion.ts')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return walk(p)
    const isSource = /\.(ts|tsx|css)$/.test(p)
    const isTest = /\.test\./.test(p) || p.includes(`${sep}test${sep}`)
    return isSource && !isTest && p !== MOTION_LIB ? [p] : []
  })
}

describe('motion is only through motion/react', () => {
  it('no vanilla CSS or JS animation in src', () => {
    const offenders = walk(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          BANNED.some((re) => re.test(line)) ||
          (!isComment(line) && BARE_TRANSITION.test(line)) ||
          (file.endsWith('.css') && CSS_BANNED.some((re) => re.test(line)))
            ? [`${file.slice(SRC.length + 1)}:${i + 1}  ${line.trim()}`]
            : [],
        ),
    )
    expect(offenders).toEqual([])
  })

  it('uses the lazy m components, not the full motion component', () => {
    const offenders = walk(SRC).filter((file) => /\.tsx?$/.test(file) && FULL_MOTION_IMPORT.test(readFileSync(file, 'utf8')))
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([])
  })
})
