import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Badge } from './badge'
import { Button } from './button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

describe('shadcn kit', () => {
  it('a disabled Button does not fire clicks', async () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('a Dialog opens, closes on Escape and returns focus to its trigger', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger asChild><Button>Open</Button></DialogTrigger>
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
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('Tabs switch panels by click and by keyboard', async () => {
    const user = userEvent.setup()
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Parish</TabsTrigger>
          <TabsTrigger value="b">Hours</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Parish panel</TabsContent>
        <TabsContent value="b">Hours panel</TabsContent>
      </Tabs>,
    )
    expect(screen.getByText('Parish panel')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Hours' }))
    expect(screen.getByText('Hours panel')).toBeVisible()
    screen.getByRole('tab', { name: 'Hours' }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Parish' })).toHaveAttribute('aria-selected', 'true')
  })

  it('a Badge renders its text', () => {
    render(<Badge>Pending</Badge>)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })
})
