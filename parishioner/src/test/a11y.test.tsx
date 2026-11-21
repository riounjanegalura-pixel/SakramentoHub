import { beforeAll, describe, expect, it } from 'vitest'
import { act } from 'react'
import { render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import userEvent from '@testing-library/user-event'
import { expectNoA11yViolations } from './a11y'
import { Field } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

describe('expectNoA11yViolations', () => {
  it('rejects a bad fragment and names both rule ids', async () => {
    const { container } = render(
      <div>
        <img src="x.png" />
        <button />
      </div>,
    )
    const error = await expectNoA11yViolations(container).then(
      () => null,
      (e: Error) => e,
    )
    expect(error).toBeInstanceOf(Error)
    expect(error!.message).toContain('image-alt')
    expect(error!.message).toContain('button-name')
  })

  it('resolves for a good fragment', async () => {
    const { container } = render(
      <div>
        <button type="button">Save</button>
      </div>,
    )
    await expect(expectNoA11yViolations(container)).resolves.toBeUndefined()
  })

  it('passes a Field with label, description and error', async () => {
    const { container } = render(
      <Field id="name" label="Full name" description="As on the baptismal record" error="Enter a name" required>
        <Input />
      </Field>,
    )
    await expectNoA11yViolations(container)
  })

  it('passes every Button variant', async () => {
    const variants = ['default', 'navy', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const
    const { container } = render(
      <div>
        {variants.map((v) => (
          <Button key={v} variant={v}>
            {v} action
          </Button>
        ))}
      </div>,
    )
    await expectNoA11yViolations(container)
  })

  it('passes Input, Textarea, Checkbox and RadioGroup with labels', async () => {
    const { container } = render(
      <form>
        <Field id="a" label="Email">
          <Input type="email" />
        </Field>
        <Field id="b" label="Notes">
          <Textarea />
        </Field>
        <div>
          <Checkbox id="c" />
          <Label htmlFor="c">I agree</Label>
        </div>
        <RadioGroup aria-label="Mass time" defaultValue="am">
          <div>
            <RadioGroupItem id="r1" value="am" />
            <Label htmlFor="r1">Morning</Label>
          </div>
          <div>
            <RadioGroupItem id="r2" value="pm" />
            <Label htmlFor="r2">Evening</Label>
          </div>
        </RadioGroup>
      </form>,
    )
    await expectNoA11yViolations(container)
  })

  it('passes an open Dialog with title and description', async () => {
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
    await user.click(document.querySelector('button')!)
    const dialog = await screen.findByRole('dialog')
    await expectNoA11yViolations(dialog)
    await expectNoA11yViolations(document.body)
  })

  it('passes with status and alert toasts showing', async () => {
    const { container } = render(<Toaster />)
    act(() => {
      toast.success('Profile saved')
      toast.error('Could not save. Try again.')
    })
    await screen.findByText('Could not save. Try again.')
    await expectNoA11yViolations(container)
    await expectNoA11yViolations(document.body)
  })
})
