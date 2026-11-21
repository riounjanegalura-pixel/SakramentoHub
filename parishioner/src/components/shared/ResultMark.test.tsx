import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render } from '@testing-library/react'
import { Check, Clock, X } from 'lucide-react'
import { ResultMark } from './ResultMark'

describe('ResultMark', () => {
  it('is decorative: the heading under it says the result in words', () => {
    const { container } = render(<ResultMark tone="done" icon={Check} />)
    expect(container.querySelector('[data-slot="result-mark"]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('done is the gold-ringed register seal; wait is navy; stop is the muted ring', () => {
    const { container } = render(
      <>
        <ResultMark tone="done" icon={Check} />
        <ResultMark tone="wait" icon={Clock} />
        <ResultMark tone="stop" icon={X} />
      </>,
    )
    const [done, wait, stop] = [...container.querySelectorAll('[data-slot="result-mark"]')]
    expect(done).toHaveClass('border-gold')
    expect(wait).toHaveClass('border-navy')
    expect(stop).toHaveClass('border-hollow')
  })
})
