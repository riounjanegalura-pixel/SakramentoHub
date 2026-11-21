/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { FormDetails } from './FormDetails'
import { SECTIONS } from './formSections'
import type { Sacrament } from '../../lib/types'

describe('FormDetails', () => {
  it('humanizes keys, hides PSGC codes and renders sponsors as a table', () => {
    render(
      <FormDetails
        formData={{
          childFirstName: 'José',
          childPlaceOfBirth: 'Balagtas, Bulacan',
          childPlaceOfBirthCityCode: '031402000',
          fatherOmitted: false,
          sponsors: [{ role: 'ninang', firstName: 'Liza', lastName: 'Soriano', age: 29, religion: 'Roman Catholic', residence: 'Balagtas' }],
        }}
      />,
    )
    expect(screen.getByText('Child first name')).toBeInTheDocument()
    expect(screen.getByText('José')).toBeInTheDocument()
    expect(screen.queryByText('031402000')).not.toBeInTheDocument()
    expect(screen.getByText('No')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /sponsors/i })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Liza Soriano' })).toBeInTheDocument()
  })

  it('renders a nested object as JSON and an array of scalars as a list', () => {
    render(<FormDetails formData={{ extra: { a: 1 }, tags: ['first', 'second'] }} />)
    expect(screen.getByText('{"a":1}')).toBeInTheDocument()
    expect(screen.getByText('first, second')).toBeInTheDocument()
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('skips null sponsors rather than crashing', () => {
    render(
      <FormDetails
        formData={{ sponsors: [null, { role: 'ninong', firstName: 'Ramon', lastName: 'Cruz', age: 40, religion: 'Roman Catholic', residence: 'Bulacan' }] }}
      />,
    )
    expect(screen.getAllByRole('row')).toHaveLength(2) // header + one sponsor
    expect(screen.getByRole('cell', { name: 'Ramon Cruz' })).toBeInTheDocument()
  })

  it('humanizes snake_case enum values but leaves names, dates and free text alone', () => {
    render(
      <FormDetails
        formData={{
          parentsMarriage: 'not_married',
          bookingFor: 'self',
          childFirstName: 'José',
          childDateOfBirth: '2025-03-14',
          occasion: 'new house warming',
        }}
      />,
    )
    expect(screen.getByText('Not married')).toBeInTheDocument()
    expect(screen.getByText('Myself')).toBeInTheDocument()
    expect(screen.getByText('José')).toBeInTheDocument()
    expect(screen.getByText('2025-03-14')).toBeInTheDocument()
    expect(screen.getByText('new house warming')).toBeInTheDocument()
  })
})

describe('FormDetails grouped by section', () => {
  it('groups a baptism booking into Child, Father, Mother and Sponsors', () => {
    render(
      <FormDetails
        sacrament="baptism"
        formData={{
          childFirstName: 'José', fatherFirstName: 'Juan', motherFirstName: 'Teresa', parentsMarriage: 'not_married',
          bookingFor: 'other', relationship: 'child',
          sponsors: [{ role: 'ninang', firstName: 'Liza', lastName: 'Soriano', age: 29, religion: 'Roman Catholic', residence: 'Balagtas' }],
        }}
      />,
    )
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)
    expect(headings).toEqual(['Child', 'Father', 'Mother', "Parents' residence and marriage", 'Sponsors', 'Booking'])
    expect(within(screen.getByRole('region', { name: 'Father' })).getByText('Juan')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Booking' })).getByText('Someone else')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Booking' })).getByText('My child')).toBeInTheDocument()
    expect(screen.getByText('Not married')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /sponsors/i })).toBeInTheDocument()
  })

  it('separates the groom, the bride and each side’s parents', () => {
    render(
      <FormDetails
        sacrament="wedding"
        formData={{ groomFirstName: 'Mark', groomFatherFirstName: 'Antonio', brideFirstName: 'Kristine', brideMotherFirstName: 'Norma', brideCivilStatus: 'separated', typeOfMarriage: 'Church wedding' }}
      />,
    )
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Groom', "Groom's parents", 'Bride', "Bride's parents", 'Wedding'])
    expect(within(screen.getByRole('region', { name: "Groom's parents" })).getByText('Antonio')).toBeInTheDocument()
    expect(screen.getByText('Legally separated')).toBeInTheDocument()
  })

  it('keeps document fields out of the list when told to, and ignores PSGC codes', () => {
    render(
      <FormDetails
        sacrament="funeral"
        hiddenKeys={['deathCertificate']}
        formData={{ deceasedFirstName: 'Pedro', deathCertificate: '/documents/u1/death.pdf', deceasedResidenceCityCode: '031402000' }}
      />,
    )
    expect(screen.queryByText('Death certificate')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View document' })).not.toBeInTheDocument()
    expect(screen.queryByText('031402000')).not.toBeInTheDocument()
  })

  it('never rewrites free text, even when it looks like an enum value', () => {
    render(<FormDetails sacrament="house-blessing" formData={{ propertyType: 'vehicle', propertyOwner: 'Ricardo', occasion: 'thanksgiving', vehiclePlate: 'nbc_1234' }} />)
    expect(screen.getByText('Vehicle')).toBeInTheDocument() // propertyType is an enum field
    expect(screen.getByText('thanksgiving')).toBeInTheDocument()
    expect(screen.getByText('nbc_1234')).toBeInTheDocument()
  })

  it('puts a field the section map does not know under Other details', () => {
    render(<FormDetails sacrament="funeral" formData={{ deceasedFirstName: 'Pedro', somethingNew: 'x' }} />)
    const other = screen.getByRole('region', { name: 'Other details' })
    expect(within(other).getByText('Something new')).toBeInTheDocument()
  })

  // The section map must cover every field the real forms produce (shared contract fixtures).
  it.each<[Sacrament, string]>([
    ['baptism', 'baptism/valid-basic'],
    ['confirmation', 'confirmation/valid-basic'],
    ['wedding', 'wedding/valid-basic'],
    ['funeral', 'funeral/valid-basic'],
    ['anointing', 'anointing/valid-hospital'],
    ['house-blessing', 'house-blessing/valid-house'],
    ['house-blessing', 'house-blessing/valid-vehicle'],
    ['house-blessing', 'house-blessing/valid-business-name'],
  ])('covers every field of the %s fixture %s', (sacrament, file) => {
    const fixture = JSON.parse(readFileSync(resolve(process.cwd(), '../contracts/fixtures', `${file}.json`), 'utf8')) as { formData: Record<string, unknown> }
    const documentKeys = Object.entries(fixture.formData)
      .filter(([, v]) => typeof v === 'string' && v.startsWith('/documents/'))
      .map(([k]) => k)
    render(<FormDetails sacrament={sacrament} formData={fixture.formData} hiddenKeys={documentKeys} />)
    expect(screen.queryByRole('region', { name: 'Other details' })).not.toBeInTheDocument()
    expect(SECTIONS[sacrament].length).toBeGreaterThan(0)
  })
})
