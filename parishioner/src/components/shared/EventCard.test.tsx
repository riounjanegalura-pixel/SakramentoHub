import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'
import { EventCard } from './EventCard'

describe('EventCard', () => {
  it('renders title, date, and location', () => {
    render(
      <EventCard
        event={{
          id: 'ev-1',
          title: 'Sunday Mass',
          date: '2026-03-16T08:00:00.000Z',
          location: 'Main Chapel',
          imageUrl: '/x.jpg',
          category: 'mass',
        }}
      />
    )
    expect(screen.getByText('Sunday Mass')).toBeInTheDocument()
    expect(screen.getByText('Main Chapel')).toBeInTheDocument()
  })
})
