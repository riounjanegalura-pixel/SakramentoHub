import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './sheet'

// The overlay motion hook reads useReducedMotion, so each case sets it here: a reduced
// case and a non-reduced control for every overlay, to show the difference is the flag.
const motion = vi.hoisted(() => ({ reduced: true }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motion.reduced,
}))

beforeEach(() => {
  motion.reduced = true
})

describe('overlays under reduced motion', () => {
  it('Dialog content is visible the moment it opens and gone once closed', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Reduced</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    await user.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog', { name: 'Reduced' })
    // Mounted at its final state: no opacity 0 start.
    expect(dialog.style.opacity).not.toBe('0')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Sheet content mounts without an off-screen offset', async () => {
    const user = userEvent.setup()
    render(
      <Sheet>
        <SheetTrigger>Menu</SheetTrigger>
        <SheetContent>
          <SheetTitle>Nav</SheetTitle>
          <SheetDescription>Pages</SheetDescription>
        </SheetContent>
      </Sheet>,
    )
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    const sheet = screen.getByRole('dialog', { name: 'Nav' })
    expect(sheet.style.transform).not.toMatch(/100%/)
    expect(sheet.style.opacity).not.toBe('0')
  })

  it('control, not reduced: Dialog content starts transparent', async () => {
    motion.reduced = false
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Animated</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    await user.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog', { name: 'Animated' })
    expect(Number(dialog.style.opacity)).toBeLessThan(1)
  })

  it('control, not reduced: Sheet content starts off-screen', async () => {
    motion.reduced = false
    const user = userEvent.setup()
    render(
      <Sheet>
        <SheetTrigger>Menu</SheetTrigger>
        <SheetContent>
          <SheetTitle>Nav</SheetTitle>
          <SheetDescription>Pages</SheetDescription>
        </SheetContent>
      </Sheet>,
    )
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    const sheet = screen.getByRole('dialog', { name: 'Nav' })
    expect(sheet.style.transform).toMatch(/100%|translateX/)
  })
})
