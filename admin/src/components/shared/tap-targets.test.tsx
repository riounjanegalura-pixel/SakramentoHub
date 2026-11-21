import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { Button } from '../ui/button'
import { JourneyRail } from './JourneyRail'

const srcDir = join(import.meta.dirname, '..', '..')

const PHONE_MIN = 44
const DESKTOP_MIN = 32

/** Pixel value of a Tailwind sizing token: h-11, size-11, min-h-11, min-h-[44px], h-[2.75rem]. */
function px(value: string): number | null {
  const bracket = /^\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(value)
  if (bracket) return Number(bracket[1]) * (bracket[2] === 'rem' ? 16 : 1)
  return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 4 : null
}

/** The smallest height a class list guarantees at one breakpoint ('' for the phone base, 'lg' for desktop), or null when it sets none. */
function guaranteedHeight(classes: string, prefix: '' | 'lg'): number | null {
  const lead = prefix ? `${prefix}:` : '(?<![:A-Za-z-])'
  let best: number | null = null
  for (const m of classes.matchAll(new RegExp(String.raw`${lead}(min-h|h|size)-(\[[^\]]+\]|[0-9.]+)(?![\w-])`, 'g'))) {
    const v = px(m[2])
    if (v !== null) best = Math.max(best ?? 0, v)
  }
  return best
}

function classesOf(el: Element): string {
  return el.getAttribute('class') ?? ''
}

function expectTapTarget(el: Element, label: string) {
  const cls = classesOf(el)
  const phone = guaranteedHeight(cls, '')
  expect(phone, `${label} sets a height of at least ${PHONE_MIN}px on phone: ${cls}`).not.toBeNull()
  expect(phone ?? 0, `${label} phone height: ${cls}`).toBeGreaterThanOrEqual(PHONE_MIN)
  const desktop = guaranteedHeight(cls, 'lg')
  if (desktop !== null) expect(desktop, `${label} desktop height: ${cls}`).toBeGreaterThanOrEqual(DESKTOP_MIN)
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'test' ? [] : sourceFiles(p)
    return /\.tsx$/.test(f) && !/\.test\./.test(f) ? [p] : []
  })
}

describe('Button', () => {
  const variants = ['default', 'navy', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const
  const sizes = ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const
  const cases = variants.flatMap((variant) => sizes.map((size) => [variant, size] as const))

  it.each(cases)('variant %s, size %s is at least 44 px on phone and 32 px on desktop', (variant, size) => {
    render(<Button variant={variant} size={size}>Go</Button>)
    expectTapTarget(screen.getByRole('button', { name: 'Go' }), `Button ${variant}/${size}`)
  })
})

describe('interactive elements in source never ask for a smaller target than the spec allows', () => {
  const TAG = /<(button|Button|Link|NavLink|a)\b((?:=>|[^>])*)>/g

  it('no button, link or Button sets a fixed height under 44 px on phone, or under 32 px on desktop', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(srcDir)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(TAG)) {
        const attrs = m[2]
        const phone = guaranteedHeight(attrs, '')
        const desktop = guaranteedHeight(attrs, 'lg')
        const line = text.slice(0, m.index).split('\n').length
        const where = `${relative(srcDir, file).split(sep).join('/')}:${line} <${m[1]}>`
        if (phone !== null && phone < PHONE_MIN) offenders.push(`${where} phone ${phone}px`)
        // lg:min-h-0 releases an inline text link (table reference, 'View all') to its natural size on desktop.
        if (desktop !== null && desktop > 0 && desktop < DESKTOP_MIN) offenders.push(`${where} desktop ${desktop}px`)
      }
    }
    expect(offenders).toEqual([])
  })
})
describe('padded controls without a height', () => {
  const TAG = /<(button|select|input|summary|Link|NavLink|a)((?:=>|[^>])*)>/g
  /** A control sized only by thin padding (py-0.5 to py-2) is under 44 px unless it also sets a height. */
  it('every button, field and link sized by py-0.5 to py-2 also sets a phone height of 44 px', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(srcDir)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(TAG)) {
        const attrs = m[2]
        if (/type="(checkbox|radio|hidden|file)"|sr-only/.test(attrs)) continue
        if (!/(?<![:A-Za-z-])py-(0\.5|1|1\.5|2)(?![\w.-])/.test(attrs)) continue
        if ((guaranteedHeight(attrs, '') ?? 0) >= PHONE_MIN) continue
        const line = text.slice(0, m.index).split('\n').length
        offenders.push(`${relative(srcDir, file).split(sep).join('/')}:${line} <${m[1]}>`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('JourneyRail', () => {
  it('has no interactive element: its nodes are hidden status marks, so no touch target applies', () => {
    const { container } = render(
      <JourneyRail
        stages={[
          { key: 'requested', label: 'Requested', state: 'done' },
          { key: 'review', label: 'Review', state: 'current' },
          { key: 'paid', label: 'Paid', state: 'future' },
        ]}
        reference="SAK-2026-0001"
      />,
    )
    expect(container.querySelectorAll('button, a, input, select, textarea, [tabindex], [role="button"]')).toHaveLength(0)
    const nodes = container.querySelectorAll('[data-node]')
    expect(nodes.length).toBeGreaterThan(0)
    for (const node of nodes) expect(node.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})
