import { describe, it, expect } from 'vitest'
import { sponsorsStep } from './SponsorsStep'

const base = { min: 1, max: 2, minAge: 16, eligibility: 'all' as const, title: 'T', hint: 'h' }
const run = (step: ReturnType<typeof sponsorsStep>, d: Record<string, unknown>) => {
  const out: string[] = []
  step.refine!(d, { addIssue: (i: { path: unknown[] }) => out.push(i.path.join('.')) } as never)
  return out
}

describe('sponsorsStep', () => {
  it('reports only the fields that have a value but fail the rule', () => {
    const step = sponsorsStep(base)
    expect(run(step, { sponsors: [{}] })).toEqual([])
    expect(run(step, { sponsors: [{ age: 12, religion: 'Islam' }] })).toEqual([
      'sponsors.0.age', 'sponsors.0.religion',
    ])
  })

  it('labels review rows with the noun, defaulting to Sponsor', () => {
    const d = { sponsors: [{ firstName: 'A', lastName: 'B' }] }
    expect(Object.keys(Object.fromEntries(sponsorsStep({ ...base, noun: 'Godparent' }).review!(d)))).toEqual(['Godparent 1'])
    expect(Object.keys(Object.fromEntries(sponsorsStep(base).review!(d)))).toEqual(['Sponsor 1'])
  })
})
