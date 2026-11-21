import { beforeAll, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './drawer'

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

describe('Drawer (phone bottom sheet)', () => {
  it('opens with its content, closes, and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    render(
      <Drawer>
        <DrawerTrigger>Open drawer</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Filters</DrawerTitle>
            <DrawerDescription>Narrow the list.</DrawerDescription>
          </DrawerHeader>
          <DrawerClose>Done</DrawerClose>
        </DrawerContent>
      </Drawer>,
    )
    const trigger = screen.getByRole('button', { name: 'Open drawer' })
    await user.click(trigger)
    // In the document straight after the click, no waiting for an animation.
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveClass('bg-surface', 'rounded-t-2xl')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
