import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { Panel } from './Panel'

describe('Panel', () => {
  it('is the navy surface: white text, 16 px radius, a gold hairline underneath, no shadow', () => {
    render(<Panel aria-label="Next for you">Pay for your Baptism</Panel>)
    const el = screen.getByLabelText('Next for you')
    expect(el).toHaveClass('bg-navy', 'text-white', 'rounded-2xl', 'border-b-[3px]', 'border-gold')
    expect(el.className.split(/\s+/).filter((c) => /(^|:)shadow/.test(c))).toEqual([])
  })

  it('marks itself with data-panel so the browser sweep can count it', () => {
    render(<Panel>One</Panel>)
    expect(document.querySelectorAll('[data-panel]')).toHaveLength(1)
  })

  it('can be another element, and takes a caller class', () => {
    render(
      <Panel as="header" className="mt-4">
        Booking
      </Panel>,
    )
    const el = screen.getByText('Booking')
    expect(el.tagName).toBe('HEADER')
    expect(el).toHaveClass('mt-4', 'bg-navy')
  })
})

describe('one Panel per screen', () => {
  const srcDir = join(import.meta.dirname, '..', '..')

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) return f === 'test' ? [] : sources(p)
      return /\.tsx$/.test(f) && !/\.test\./.test(f) ? [p] : []
    })
  }

  it('no screen file draws <Panel more than once (a second navy block would compete with the first)', () => {
    const offenders: string[] = []
    for (const dir of ['features', 'web']) {
      for (const p of sources(join(srcDir, dir))) {
        const n = (readFileSync(p, 'utf8').match(/<Panel\b/g) ?? []).length
        if (n > 1) offenders.push(`${relative(srcDir, p).split(sep).join('/')}: ${n}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
