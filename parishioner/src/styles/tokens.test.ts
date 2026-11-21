import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(import.meta.dirname, 'globals.css'), 'utf8')
const srcDir = join(import.meta.dirname, '..')

/** The `:root { ... }` block, comments stripped. */
function rootBlock(): string {
  const m = /:root\s*\{([\s\S]*?)\n\}/.exec(css)
  if (!m) throw new Error(':root block missing in globals.css')
  return m[1].replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Resolved value of a `:root` custom property, following var() aliases. */
function token(name: string): string {
  const m = new RegExp(String.raw`--${name}:\s*([^;]+);`).exec(rootBlock())
  if (!m) throw new Error(`--${name} is not defined on :root`)
  const v = m[1].trim()
  const alias = /^var\(--([a-z0-9-]+)\)$/.exec(v)
  return alias ? token(alias[1]) : v
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const hex = (name: string) => (name === 'white' ? '#FFFFFF' : token(name))

/** Every non-test .ts, .tsx and .css file under a directory. */
function sourcesOf(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return sourcesOf(p)
    return /\.(tsx?|css)$/.test(f) && !/\.test\./.test(f) ? [p] : []
  })
}

const SPEC_TOKENS = [
  'paper', 'surface', 'line', 'ink', 'ink-muted', 'navy', 'navy-deep',
  'gold', 'gold-text', 'gold-press',
  'status-pending-bg', 'status-pending-fg', 'status-confirmed-bg', 'status-confirmed-fg',
  'status-rejected-bg', 'status-rejected-fg', 'status-done-bg', 'status-done-fg',
  'danger', 'focus', 'input-border',
  'paper-deep', 'on-navy', 'hollow',
]

describe('design tokens (spec section 3)', () => {
  it.each(SPEC_TOKENS)('defines --%s on :root as #RRGGBB', (name) => {
    expect(token(name)).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it.each(SPEC_TOKENS)('maps --%s into the Tailwind theme so utilities are generated', (name) => {
    const theme = css.slice(css.indexOf('@theme inline'))
    expect(theme).toContain(`--color-${name}: var(--${name});`)
  })

  it('maps the shadcn variables onto the tokens', () => {
    expect(token('primary')).toBe(token('navy'))
    expect(token('primary-foreground')).toBe(token('surface'))
    expect(token('ring')).toBe(token('focus'))
    expect(token('input')).toBe(token('input-border'))
    expect(token('background')).toBe(token('paper'))
    expect(token('foreground')).toBe(token('ink'))
    expect(token('card')).toBe(token('surface'))
    expect(token('border')).toBe(token('line'))
    expect(token('muted-foreground')).toBe(token('ink-muted'))
  })
})

describe('type and colour roles', () => {
  it('declares a light-only colour scheme', () => {
    expect(rootBlock()).toMatch(/color-scheme:\s*light;/)
  })

  it('gives native radios and checkboxes the navy action colour, never gold', () => {
    expect(css).toMatch(/accent-color:\s*var\(--navy\)/)
  })

  it.each(['display', 'title', 'heading', 'body', 'note', 'label'])('defines the %s type role and its Tailwind utility', (role) => {
    expect(rootBlock()).toMatch(new RegExp(String.raw`--fs-${role}:\s*[\d.]+rem;`))
    expect(css).toContain(`--text-${role}: var(--fs-${role});`)
  })

  it('defines the entry-title and amount roles and their Tailwind utilities', () => {
    expect(rootBlock()).toMatch(/--fs-display-xl:\s*clamp\(1\.625rem,\s*6vw,\s*2\.125rem\);/)
    expect(rootBlock()).toMatch(/--fs-amount:\s*2\.5rem;/)
    expect(css).toContain('--text-display-xl: var(--fs-display-xl);')
    expect(css).toContain('--text-amount: var(--fs-amount);')
    expect(css).toMatch(/--text-amount--font-weight:\s*700;/)
    // The desktop entry title steps up to 44 px.
    expect(/@media \(min-width: 1024px\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1]).toMatch(/--fs-display-xl:\s*2\.75rem;/)
  })

  it('hollow is never a text colour', () => {
    const offenders = sourcesOf(srcDir).filter((p) => /\btext-hollow\b/.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('white on the navy action colour meets 4.5:1', () => {
    expect(ratio(hex(token('primary-foreground') === token('surface') ? 'surface' : 'white'), hex('primary'))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('contrast (WCAG)', () => {
  const textPairs: Array<[string, string]> = [
    ['ink', 'paper'],
    ['ink-muted', 'paper'],
    ['ink-muted', 'surface'],
    ['gold-text', 'surface'],
    ['navy', 'gold'],
    ['white', 'navy'],
    ['on-navy', 'navy'],
    ['ink-muted', 'paper-deep'],
    ['navy', 'paper-deep'],
    ['status-pending-fg', 'status-pending-bg'],
    ['status-confirmed-fg', 'status-confirmed-bg'],
    ['status-rejected-fg', 'status-rejected-bg'],
    ['status-done-fg', 'status-done-bg'],
    ['danger', 'surface'],
  ]
  it.each(textPairs)('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(hex(fg), hex(bg))).toBeGreaterThanOrEqual(4.5)
  })

  const uiPairs: Array<[string, string]> = [
    ['focus', 'surface'],
    ['input-border', 'surface'],
    // Shapes only (dashed tear-lines, future-step rings): never a text colour.
    ['hollow', 'paper'],
  ]
  it.each(uiPairs)('UI %s on %s is at least 3:1', (fg, bg) => {
    expect(ratio(hex(fg), hex(bg))).toBeGreaterThanOrEqual(3)
  })
})

describe('legacy tokens are gone', () => {
  it('declares no brand-* colours and no card shadow token', () => {
    expect(css).not.toMatch(/--color-brand-/)
    expect(css).not.toMatch(/--shadow-card/)
  })

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) return sources(p)
      return /\.(tsx?|css)$/.test(f) && !/\.test\./.test(f) ? [p] : []
    })
  }

  it('no source file uses a brand-* utility, a shadow-card, or a raw hex colour class', () => {
    const offenders: string[] = []
    for (const p of sources(srcDir)) {
      const text = readFileSync(p, 'utf8')
      const rel = relative(srcDir, p).split(sep).join('/')
      if (/\b(?:bg|text|border|ring|outline|fill|stroke|divide|from|to|via)-brand-(?!mark)/.test(text)) offenders.push(`${rel}: brand-*`)
      if (/shadow-card/.test(text)) offenders.push(`${rel}: shadow-card`)
      if (/\b(?:bg|text|border|ring|outline|fill|stroke)-\[#[0-9A-Fa-f]{3,8}\]/.test(text)) offenders.push(`${rel}: raw hex class`)
      if (/\b(?:bg|text|border|ring)-(?:red|green|amber|yellow|orange|blue|slate|gray|zinc|stone)-\d{2,3}\b/.test(text)) offenders.push(`${rel}: Tailwind palette colour`)
    }
    expect(offenders).toEqual([])
  })
})

describe('base layer', () => {
  it('keeps the dark variant on the .dark class and the kit base layer', () => {
    expect(css).toContain('@custom-variant dark (&:is(.dark *));')
    expect(css).toMatch(/@layer base\s*\{\s*\[data-slot\]\s*\{[^}]*border-color:\s*var\(--border\)/)
  })

  it('draws focus outlines in the focus token at full strength, never through color-mix', () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }))
    const outlineRules = rules.filter((r) => /outline/.test(r.body))
    expect(outlineRules.length).toBeGreaterThan(0)
    for (const r of outlineRules) expect(r.body).not.toMatch(/color-mix/)
    expect(css).toMatch(/\[data-slot\]\s*\{[^}]*outline-color:\s*var\(--focus\)/)
    expect(css).toMatch(/\[data-slot\]:focus-visible\s*\{[^}]*outline-width:\s*2px[^}]*outline-offset:\s*2px/)
  })

  it('gives every link, button, summary and field a focus outline, so no control is left without a ring', () => {
    expect(css).toMatch(/:where\(a\[href\], button, summary, input, select, textarea, \[tabindex\]\):focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus\)/)
  })

  it('has no tw-animate-css import: overlays animate through motion', () => {
    expect(css).not.toContain('tw-animate-css')
  })

  it('has no top-level * selector inside an @layer base block', () => {
    const layers = css.match(/@layer base\s*\{[\s\S]*?\n\}/g) ?? []
    for (const layer of layers) expect(layer).not.toMatch(/^\s*\*\s*\{/m)
  })
})

describe('gold is never a text colour', () => {
  // Files that still use gold as text, to be migrated later.
  // Any file not listed here must not use it; the list may only shrink.
  const KNOWN_LEGACY = new Set<string>([])
  const GOLD_TEXT = /\btext-(?:brand-)?gold(?:-deep|-press)?\b(?!-)/

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) return files(p)
      return /\.(tsx?|css)$/.test(f) && !/\.test\./.test(f) ? [p] : []
    })
  }

  it.each([...KNOWN_LEGACY])('legacy entry %s still uses text-gold (a stale entry fails)', (rel) => {
    expect(readFileSync(join(srcDir, rel), 'utf8')).toMatch(GOLD_TEXT)
  })

  it('no source file outside the legacy list uses text-gold', () => {
    const offenders = files(srcDir)
      .filter((p) => GOLD_TEXT.test(readFileSync(p, 'utf8')))
      .map((p) => relative(srcDir, p).split(sep).join('/'))
      .filter((p) => !KNOWN_LEGACY.has(p))
    expect(offenders).toEqual([])
  })
})

describe('self-hosted fonts (spec sections 3 and 13)', () => {
  const html = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8')
  const main = readFileSync(join(import.meta.dirname, '..', 'main.tsx'), 'utf8')

  it('index.html makes no request to Google Fonts', () => {
    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).not.toContain('fonts.gstatic.com')
  })

  it.each([
    ['display', 'Fraunces Variable', 'serif'],
    ['sans', 'Inter Variable', 'sans-serif'],
    ['mono', 'JetBrains Mono Variable', 'monospace'],
  ])('--font-%s starts with the self-hosted %s and has a fallback', (name, family, generic) => {
    const m = new RegExp(String.raw`--font-${name}:\s*([^;]+);`).exec(css)
    expect(m?.[1].trim()).toMatch(new RegExp(`^"${family}",.*${generic}$`))
  })

  it('main.tsx imports the three variable font packages', () => {
    for (const p of ['fraunces', 'inter', 'jetbrains-mono'])
      expect(main).toContain(`import '@fontsource-variable/${p}'`)
  })

  it('defines a .numeric utility with tabular numerals in the mono family', () => {
    const m = /\.numeric\s*\{([^}]*)\}/.exec(css)
    expect(m?.[1]).toContain('font-variant-numeric: tabular-nums')
    expect(m?.[1]).toContain('var(--font-mono)')
  })
})

describe('focus and reduced motion rules in globals.css (task 1.7)', () => {
  it('the focus-visible white gap uses the surface token, not a literal', () => {
    const m = /\[data-slot\]:focus-visible\s*\{([^}]*)\}/.exec(css)
    expect(m?.[1]).toContain('box-shadow: 0 0 0 2px var(--surface)')
    expect(m?.[1]).not.toMatch(/#fff/i)
  })

  it('vaul drawer and overlay stop animating under prefers-reduced-motion', () => {
    const m = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)
    expect(m?.[1]).toContain('[data-vaul-drawer]')
    expect(m?.[1]).toContain('[data-vaul-overlay]')
    expect(m?.[1]).toMatch(/transition:\s*none/)
    expect(m?.[1]).toMatch(/animation:\s*none/)
  })
})

describe('no glass chrome', () => {
  it('declares no glass tokens and maps none into the theme', () => {
    expect(css).not.toMatch(/glass/)
  })
})

describe('chrome clearance (spec section 10 item 4)', () => {
  const raw = (name: string) => {
    const m = new RegExp(String.raw`--${name}:\s*([^;]+);`).exec(rootBlock())
    if (!m) throw new Error(`--${name} is not defined on :root`)
    return m[1].trim()
  }
  const rule = (selector: string) => new RegExp(String.raw`^${selector}\s*\{([^}]*)\}`, 'm').exec(css)?.[1] ?? ''
  const shell = readFileSync(join(srcDir, 'components/shared/AppShell.tsx'), 'utf8')

  it('defines the header and bar clearances once on :root', () => {
    expect(raw('chrome-top')).toBe('4.5rem')
    expect(raw('chrome-bottom')).toBe('calc(5rem + env(safe-area-inset-bottom))')
  })

  it('keeps focused controls clear of the sticky header and the docked bar, only while the phone chrome is on the page', () => {
    // Scoped to the phone shell's marker: a desktop page (no glass header, no bar) gets no scroll padding.
    expect(css).not.toMatch(/^html\s*\{[^}]*scroll-padding/m)
    expect(rule(String.raw`html:has\(\[data-chrome~="top"\]\)`)).toMatch(/scroll-padding-top:\s*var\(--chrome-top\)/)
    expect(rule(String.raw`html:has\(\[data-chrome~="bottom"\]\)`)).toMatch(/scroll-padding-bottom:\s*var\(--chrome-bottom\)/)
    // AppShell's phone frame is what sets the marker.
    expect(shell).toContain('data-chrome=')
  })

  it('AppShell bottom padding uses the same custom property as the scroll padding', () => {
    expect(shell).toContain('pb-[var(--chrome-bottom)]')
  })
})

describe('contrast in use (task 5.2): every text colour class in src is legible on its background', () => {
  // Tailwind's default palette entries the app uses, so they can be measured.
  const TAILWIND: Record<string, string> = {
    'red-600': '#DC2626', 'red-700': '#B91C1C', 'green-700': '#15803D', 'slate-500': '#64748B',
    white: '#FFFFFF', black: '#000000',
  }
  const NON_COLOUR = /^(?:display|display-xl|amount|title|heading|body|note|label|xs|sm|base|lg|xl|[2-9]xl|left|right|center|justify|start|end|balance|pretty|wrap|nowrap|ellipsis|clip|current|inherit|transparent)$/

  /** `--color-NAME` entries of the theme, resolved to a hex value where they have one. */
  function themeColour(name: string): string | null {
    if (TAILWIND[name]) return TAILWIND[name]
        const m = new RegExp(String.raw`--color-${name}:\s*([^;]+);`).exec(css)
    if (!m) return null
    const v = m[1].trim()
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v.toUpperCase()
    const alias = /^var\(--([a-z0-9-]+)\)$/.exec(v)
    if (!alias) return null
    try {
      const t = token(alias[1])
      return /^#[0-9A-Fa-f]{6}$/.test(t) ? t.toUpperCase() : null
    } catch {
      return null
    }
  }

  /** `name` or `name/NN` to a hex colour and an alpha. */
  function parseColour(spec: string): { hex: string; alpha: number } | null | 'unknown' {
    const [name, a] = spec.split('/')
    if (NON_COLOUR.test(name)) return null
    const arbitrary = /^\[(#[0-9A-Fa-f]{6})\]$/.exec(name)
    if (arbitrary) return { hex: arbitrary[1].toUpperCase(), alpha: a ? Number(a) / 100 : 1 }
    if (name.startsWith('[')) return null // arbitrary size or length
    const hexValue = themeColour(name)
    if (!hexValue) return 'unknown'
    return { hex: hexValue, alpha: a ? Number(a) / 100 : 1 }
  }

  const channels = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  function over(fg: string, alpha: number, bg: string): string {
    const [f, b] = [channels(fg), channels(bg)]
    return '#' + f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('').toUpperCase()
  }

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) return f === 'test' ? [] : sourceFiles(p)
      return /\.tsx$/.test(f) && !/\.test\./.test(f) ? [p] : []
    })
  }

  const surface = token('surface').toUpperCase()
  const paper = token('paper').toUpperCase()
  const navy = token('navy').toUpperCase()

  it('text classes reach 4.5:1 on their own background class, or on paper and surface when the string has none', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(srcDir)) {
      const raw = readFileSync(file, 'utf8')
      // Comments are blanked (newlines kept) so apostrophes in prose cannot pair up as string quotes.
      const text = raw.replace(/\/\*[\s\S]*?\*\/|(?<![:'"`])\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, ' '))
      // Class strings: single-line quoted literals, plus the static parts of template literals.
      const literals = [
        ...text.matchAll(/(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g),
        ...text.replace(/\$\{[^}]*}/g, (c) => ' '.repeat(c.length)).matchAll(/(`)((?:\\.|[^\\`])*)\1/g),
      ]
      for (const lit of literals) {
        const tokens = lit[2].split(/\s+/).filter(Boolean)
        if (!tokens.some((t) => /(?:^|:)text-/.test(t))) continue
        const line = text.slice(0, lit.index).split('\n').length
        const bgToken = tokens.find((t) => /^bg-[a-z0-9-]+(?:\/\d+)?$/.test(t))
        const bgSpec = bgToken ? parseColour(bgToken.slice(3)) : null
        const bgs = (light: boolean): string[] => {
          // Light text (white, gold) sits on a dark parent the string does not show: the one dark surface is navy.
          const bases = light ? [navy] : [paper, surface]
          return bgSpec && bgSpec !== 'unknown' ? bases.map((b) => over(bgSpec.hex, bgSpec.alpha, b)) : bases
        }
        for (const t of tokens) {
          const m = /^((?:[a-z-]+:)*)text-([a-z0-9-]+(?:\/\d+)?|\[#[0-9A-Fa-f]{6}\])$/.exec(t)
          if (!m || m[1].includes('dark:')) continue
          const fg = parseColour(m[2])
          if (fg === null) continue
          const where = `${relative(srcDir, file).split(sep).join('/')}:${line}`
          if (fg === 'unknown') {
            offenders.push(`${where} ${t}: colour not resolvable (add it to this test)`)
            continue
          }
          for (const bg of bgs(luminance(fg.hex) > 0.4)) {
            const r = ratio(over(fg.hex, fg.alpha, bg), bg)
            if (r < 4.5) offenders.push(`${where} ${t} on ${bg}${bgToken ? ' (' + bgToken + ')' : ''}: ${r.toFixed(2)}:1`)
          }
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([])
  })
})
