import { describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { DeskHomeScreen } from './DeskHomeScreen'
import { useAuthStore } from '../../stores/auth-store'
import { useBookingStore } from '../../stores/booking-store'
import { useDeskStore } from '../../stores/desk-store'

function Where() {
  return <p>At {useLocation().pathname}</p>
}

describe('DeskHomeScreen', () => {
  beforeEach(() => {
    useBookingStore.getState().reset()
    useDeskStore.getState().reset()
    useAuthStore.setState({ user: { id: 's1', fullName: 'Staff User', email: 's@example.com', phone: '', address: '', role: 'staff' }, isBootstrapping: false })
  })

  it('offers all six sacraments and starts a clean walk-in for the one picked', async () => {
    useDeskStore.getState().setContact({ fullName: 'Left over', phone: '09171234567', email: '' })
    render(
      <MemoryRouter initialEntries={['/desk']}>
        <Routes>
          <Route path="/desk" element={<DeskHomeScreen />} />
          <Route path="/desk/:sacrament/:step" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText(/signed in as staff user/i)).toBeInTheDocument()
    for (const name of [/baptism/i, /wedding/i, /confirmation/i, /funeral mass/i, /anointing of the sick/i, /house blessing/i]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }

    await userEvent.click(screen.getByRole('button', { name: /funeral mass/i }))
    expect(await screen.findByText('At /desk/funeral/1')).toBeInTheDocument()
    expect(useBookingStore.getState().sacrament).toBe('funeral')
    expect(useDeskStore.getState().contact).toBeNull()
  })
})
