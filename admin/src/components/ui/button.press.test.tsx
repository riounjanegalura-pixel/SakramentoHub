import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { press } from '@/lib/motion'

const seen: Array<Record<string, unknown>> = []
vi.mock('motion/react-m', () => ({
  button: (props: Record<string, unknown>) => {
    seen.push(props)
    return <button type="button">{props.children as never}</button>
  },
}))

import { Button } from './button'

describe('Button press feedback', () => {
  it('wires the press token through the slim motion button', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button')).toBeInTheDocument()
    expect(seen[0].whileTap).toEqual({ transform: press.transform })
    // A release must return to scale(1); "none" is read as scale(0) and the button disappears.
    expect(seen[0].animate).toEqual({ transform: 'scale(1)' })
    expect(seen[0].transition).toEqual(press.transition)
  })

  it('does not press a disabled button', () => {
    seen.length = 0
    render(<Button disabled>Save</Button>)
    expect(seen[0].whileTap).toBeUndefined()
  })
})
