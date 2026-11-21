import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'
import { OnboardingCarousel } from './OnboardingCarousel'
import { ONBOARDING_SLIDES } from './slides'

describe('OnboardingCarousel', () => {
  it('advances to the next slide on Next click', () => {
    render(
      <MemoryRouter>
        <OnboardingCarousel />
      </MemoryRouter>
    )
    expect(screen.getByText('Welcome to SakramentoHub')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next'))
    expect(screen.queryByText('Welcome to SakramentoHub')).not.toBeInTheDocument()
    expect(screen.getByText('Book Sacraments Anytime')).toBeInTheDocument()
  })

  it('shows a back chevron on slide 2 that returns to the first slide', () => {
    render(
      <MemoryRouter>
        <OnboardingCarousel />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Book Sacraments Anytime')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous slide' }))
    expect(screen.getByText('Welcome to SakramentoHub')).toBeInTheDocument()
  })

  it('steps through every slide in order via repeated Next clicks', () => {
    render(
      <MemoryRouter>
        <OnboardingCarousel />
      </MemoryRouter>
    )
    for (let i = 0; i < ONBOARDING_SLIDES.length - 1; i++) {
      expect(screen.getByText(ONBOARDING_SLIDES[i].title)).toBeInTheDocument()
      fireEvent.click(screen.getByText('Next'))
    }
    expect(
      screen.getByText(ONBOARDING_SLIDES[ONBOARDING_SLIDES.length - 1].title)
    ).toBeInTheDocument()
  })

  it('shows "Get started" instead of "Next" on the final slide', () => {
    render(
      <MemoryRouter>
        <OnboardingCarousel />
      </MemoryRouter>
    )
    for (let i = 0; i < ONBOARDING_SLIDES.length - 1; i++) {
      fireEvent.click(screen.getByText('Next'))
    }
    expect(screen.queryByText('Next')).not.toBeInTheDocument()
    expect(screen.getByText('Get started')).toBeInTheDocument()
  })

  function renderWithRoutes() {
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingCarousel />} />
          <Route path="/register" element={<div>Register Page</div>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('navigates straight to /register when Get started is tapped on the final slide', () => {
    renderWithRoutes()
    for (let i = 0; i < ONBOARDING_SLIDES.length - 1; i++) {
      fireEvent.click(screen.getByText('Next'))
    }
    fireEvent.click(screen.getByText('Get started'))
    expect(screen.getByText('Register Page')).toBeInTheDocument()
    expect(screen.queryByText('Ready to Get Started?')).not.toBeInTheDocument()
  })

  it('shows the Sign in link only on the final slide, and it navigates to /login', () => {
    renderWithRoutes()
    expect(screen.queryByText('Already have an account?')).not.toBeInTheDocument()
    for (let i = 0; i < ONBOARDING_SLIDES.length - 1; i++) {
      expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('Next'))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('renders progress dots matching the number of slides, with the current one active', () => {
    render(
      <MemoryRouter>
        <OnboardingCarousel />
      </MemoryRouter>
    )
    const dots = screen.getAllByTestId('onboarding-dot')
    expect(dots).toHaveLength(ONBOARDING_SLIDES.length)
    expect(dots[0]).toHaveClass('bg-navy')
    fireEvent.click(screen.getByText('Next'))
    expect(dots[1]).toHaveClass('bg-navy')
    expect(dots[0]).not.toHaveClass('bg-navy')
  })
})
