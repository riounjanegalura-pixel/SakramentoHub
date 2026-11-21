import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet'

describe('overlay close buttons', () => {
  it('Dialog close has a 44 px hit area and the focus token ring', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>T</DialogTitle>
          <DialogDescription>D</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close).toHaveClass('size-11', 'focus-visible:ring-2', 'focus-visible:ring-focus', 'focus-visible:ring-offset-2')
    expect(close.className).not.toMatch(/ring-ring/)
  })

  it('Sheet close has a 44 px hit area and the focus token ring', () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>T</SheetTitle>
          <SheetDescription>D</SheetDescription>
        </SheetContent>
      </Sheet>,
    )
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close).toHaveClass('size-11', 'focus-visible:ring-2', 'focus-visible:ring-focus', 'focus-visible:ring-offset-2')
    expect(close.className).not.toMatch(/ring-ring/)
  })
})
