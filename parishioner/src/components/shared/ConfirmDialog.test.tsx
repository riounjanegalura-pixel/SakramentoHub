import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setViewport } from '../../test/viewport'
import { expectNoA11yViolations } from '../../test/a11y'
import { ConfirmDialog } from './ConfirmDialog'

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Delete thing</button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Delete the thing?" description="This cannot be undone.">
        <button type="button" onClick={() => setOpen(false)}>Keep it</button>
      </ConfirmDialog>
    </>
  )
}

describe('ConfirmDialog', () => {
  afterEach(() => setViewport(390))

  it('is a bottom drawer on a phone, with the title, the description and focus returned on cancel', async () => {
    setViewport(390)
    const user = userEvent.setup()
    const { container } = render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Delete thing' })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Delete the thing?' })
    expect(dialog).toHaveAttribute('data-slot', 'drawer-content')
    expect(dialog).toHaveTextContent('This cannot be undone.')
    await expectNoA11yViolations(document.body)
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
    void container
  })

  it('is a centred dialog on a desktop and gives focus back on Escape', async () => {
    setViewport(1280)
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Delete thing' })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Delete the thing?' })
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
