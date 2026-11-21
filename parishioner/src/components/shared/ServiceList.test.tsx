import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ServiceList } from './ServiceList'
import { SERVICES } from '../../lib/mock/services'
import { expectNoA11yViolations } from '../../test/a11y'

const renderList = () => render(<MemoryRouter><ServiceList services={SERVICES} /></MemoryRouter>)

describe('ServiceList', () => {
  it('renders every service as a row that is a link to its page, in the order of the list', async () => {
    const { container } = renderList()
    for (const s of SERVICES) {
      expect(screen.getByRole('link', { name: new RegExp(s.name) })).toHaveAttribute('href', `/services/${s.id}`)
    }
    expect(screen.getAllByRole('link')).toHaveLength(SERVICES.length)
    await expectNoA11yViolations(container)
  })

  it('has no carousel: no region, no Previous or Next buttons, nothing off screen', () => {
    const { container } = renderList()
    expect(screen.queryByRole('region', { name: 'Services' })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(container.innerHTML).not.toMatch(/basis-\[|overflow-x|snap/)
  })

  it('separates the urgent two, last, under their own heading', () => {
    renderList()
    const urgent = screen.getByRole('heading', { name: 'When it is urgent' }).closest('section')!
    expect(within(urgent).getAllByRole('link')).toHaveLength(2)
    const planned = screen.getByRole('list', { name: 'Sacraments' })
    expect(planned.textContent).not.toMatch(/Funeral|Anointing/)
  })

  it('lets the keyboard walk every row in order and leave again (no focus trap)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ServiceList services={SERVICES} />
        <button type="button">After</button>
      </MemoryRouter>,
    )
    for (const link of screen.getAllByRole('link')) {
      await user.tab()
      expect(document.activeElement).toBe(link)
    }
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'After' }))
  })
})
