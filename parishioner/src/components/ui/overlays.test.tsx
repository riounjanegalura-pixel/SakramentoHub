import * as React from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './sheet'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { CommandDialog, CommandInput, CommandItem, CommandList } from './command'

beforeAll(() => {
  // Radix Select and menus lean on pointer-capture and scrolling APIs jsdom lacks.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

describe('overlays animate through motion and unmount after exit', () => {
  it('Dialog: opens with role dialog, Escape closes it, focus returns to the trigger', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Reject document</DialogTitle>
          <DialogDescription>Say why.</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    const trigger = screen.getByRole('button', { name: 'Open' })
    await user.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Reject document' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('Dialog: the close button removes it and no tw-animate classes remain', async () => {
    const user = userEvent.setup()
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Hello</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    const dialog = await screen.findByRole('dialog')
    expect(dialog.className).not.toMatch(/animate-(in|out)|zoom-|fade-in|slide-in/)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Sheet: opens and closes with Escape, focus returns', async () => {
    const user = userEvent.setup()
    render(
      <Sheet>
        <SheetTrigger>Menu</SheetTrigger>
        <SheetContent side="left">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Pages</SheetDescription>
        </SheetContent>
      </Sheet>,
    )
    const trigger = screen.getByRole('button', { name: 'Menu' })
    await user.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Navigation' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('Popover: opens, closes on Escape, focus returns', async () => {
    const user = userEvent.setup()
    render(
      <Popover>
        <PopoverTrigger>Info</PopoverTrigger>
        <PopoverContent>Popover body</PopoverContent>
      </Popover>,
    )
    const trigger = screen.getByRole('button', { name: 'Info' })
    await user.click(trigger)
    expect(await screen.findByText('Popover body')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Popover body')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('DropdownMenu: opens as a menu, Escape closes it, focus returns', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Edit</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    const trigger = screen.getByRole('button', { name: 'Actions' })
    await user.click(trigger)
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('Tooltip: shows on keyboard focus with role tooltip and leaves on Escape', async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hint</TooltipTrigger>
          <TooltipContent>Helpful words</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )
    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Helpful words')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })

  it('Select: opens a listbox, choosing an option closes it and focus returns', async () => {
    const user = userEvent.setup()
    render(
      <Select>
        <SelectTrigger aria-label="Parish"><SelectValue placeholder="Pick" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
          <SelectItem value="b">Beta</SelectItem>
        </SelectContent>
      </Select>,
    )
    const trigger = screen.getByRole('combobox', { name: 'Parish' })
    await user.click(trigger)
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Beta' }))
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('CommandDialog: opens as a dialog and leaves when closed', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = React.useState(true)
      return (
        <CommandDialog open={open} onOpenChange={setOpen}>
          <CommandInput placeholder="Search" />
          <CommandList><CommandItem>One</CommandItem></CommandList>
        </CommandDialog>
      )
    }
    render(<Harness />)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
