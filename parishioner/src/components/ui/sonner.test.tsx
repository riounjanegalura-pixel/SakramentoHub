import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { toast } from 'sonner'
import { describe, expect, it } from 'vitest'
import { Toaster } from './sonner'

describe('Toaster', () => {
  it('renders a toast without a theme provider', async () => {
    render(<Toaster />)
    act(() => {
      toast('Saved')
    })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('announces a plain toast as a status', async () => {
    render(<Toaster />)
    act(() => {
      toast.success('Profile saved')
    })
    const text = await screen.findByText('Profile saved')
    await waitFor(() => expect(text.closest('[role="status"]')).not.toBeNull())
  })

  it('announces an error toast as an alert', async () => {
    render(<Toaster />)
    act(() => {
      toast.error('Could not save. Check your connection and try again.')
    })
    const text = await screen.findByText('Could not save. Check your connection and try again.')
    await waitFor(() => expect(text.closest('[role="alert"]')).not.toBeNull())
  })
})
