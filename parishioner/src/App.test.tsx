import { configure, render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'
import App from './App'

// A screen's chunk is imported on first visit; in a cold test run that includes transforming the module.
configure({ asyncUtilTimeout: 10_000 })

describe('App', () => {
  it('renders the router and shows the onboarding carousel at the root route', async () => {
    render(<App />)
    expect(await screen.findByText('Welcome to SakramentoHub')).toBeInTheDocument()
  })
})
