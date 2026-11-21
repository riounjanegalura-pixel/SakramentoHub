import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CascadingAddressPicker } from './CascadingAddressPicker'
import type { PsgcPlaceValue } from '../../lib/validation/psgc'

const EMPTY: PsgcPlaceValue = {
  display: '',
  regionCode: '',
  provinceCode: '',
  cityCode: '',
  barangayCode: '',
}

const fixtures: Record<string, unknown> = {
  '/regions.json': [
    { code: '130000000', name: 'National Capital Region', regionName: 'NCR' },
    { code: '030000000', name: 'Central Luzon', regionName: 'Region III' },
  ],
  '/regions/030000000/provinces.json': [
    { code: '031400000', name: 'Bulacan' },
    { code: '030800000', name: 'Bataan' },
  ],
  '/regions/030000000/cities-municipalities.json': [
    { code: '031410000', name: 'City of Malolos', provinceCode: '031400000' },
    { code: '031402000', name: 'Balagtas', provinceCode: '031400000' },
    { code: '030801000', name: 'Abucay', provinceCode: '030800000' },
  ],
  '/cities-municipalities/031410000/barangays.json': [
    { code: '031410002', name: 'Atlag' },
    { code: '031410001', name: 'Anilao' },
  ],
  '/regions/130000000/provinces.json': [],
  '/regions/130000000/cities-municipalities.json': [
    { code: '133900000', name: 'City of Manila', provinceCode: false },
    { code: '137404000', name: 'Quezon City', provinceCode: false },
  ],
}

function mockPsgc({ failAll = false } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace('https://psgc.gitlab.io/api', '')
    if (failAll || !(path in fixtures)) return new Response('nope', { status: 503 })
    return new Response(JSON.stringify(fixtures[path]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

let latest: PsgcPlaceValue = EMPTY

function Harness({ initial = EMPTY, error }: { initial?: PsgcPlaceValue; error?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <CascadingAddressPicker
      id="pob"
      label="Place of birth"
      required
      error={error}
      value={value}
      onChange={(v) => {
        latest = v
        setValue(v)
      }}
    />
  )
}

function renderPicker(props: { initial?: PsgcPlaceValue; error?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>,
  )
}

describe('CascadingAddressPicker', () => {
  beforeEach(() => {
    latest = EMPTY
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps each level disabled until its parent is chosen', async () => {
    mockPsgc()
    renderPicker()

    await screen.findByRole('option', { name: 'Region III – Central Luzon' }, { timeout: 5000 })
    expect(screen.getByLabelText('Province')).toBeDisabled()
    expect(screen.getByLabelText('City / Municipality')).toBeDisabled()
    expect(screen.getByLabelText('Barangay')).toBeDisabled()
  })

  it('cascades Region → Province → City → Barangay and builds a readable place', async () => {
    mockPsgc()
    const user = userEvent.setup()
    renderPicker()

    await screen.findByRole('option', { name: 'Region III – Central Luzon' }, { timeout: 5000 })
    await user.selectOptions(screen.getByLabelText('Region'), '030000000')
    await waitFor(() => expect(screen.getByLabelText('Province')).toBeEnabled())
    // Only the region was chosen — not a usable place yet.
    expect(latest.display).toBe('')

    await user.selectOptions(screen.getByLabelText('Province'), '031400000')
    const city = screen.getByLabelText('City / Municipality')
    await waitFor(() => expect(city).toBeEnabled())
    // Cities are filtered to the chosen province.
    expect(screen.queryByRole('option', { name: 'Abucay' })).not.toBeInTheDocument()

    await user.selectOptions(city, '031410000')
    // The barangay is required, so the place is not complete until it is chosen too.
    expect(latest).toMatchObject({
      display: '',
      regionCode: '030000000',
      provinceCode: '031400000',
      cityCode: '031410000',
      barangayCode: '',
    })

    const barangay = screen.getByLabelText('Barangay')
    await waitFor(() => expect(barangay).toBeEnabled())
    await user.selectOptions(barangay, '031410002')
    expect(latest).toMatchObject({
      display: 'Atlag, City of Malolos, Bulacan',
      barangayCode: '031410002',
    })
  })

  it('clears the lower levels when a parent changes', async () => {
    mockPsgc()
    const user = userEvent.setup()
    renderPicker({
      initial: {
        display: 'Atlag, City of Malolos, Bulacan',
        regionCode: '030000000',
        provinceCode: '031400000',
        cityCode: '031410000',
        barangayCode: '031410002',
      },
    })

    await waitFor(() => expect(screen.getByLabelText('Province')).toHaveValue('031400000'))
    await user.selectOptions(screen.getByLabelText('Province'), '030800000')
    expect(latest).toMatchObject({
      display: '',
      provinceCode: '030800000',
      cityCode: '',
      barangayCode: '',
    })
  })

  it('skips the province level for NCR and names the region instead', async () => {
    mockPsgc()
    const user = userEvent.setup()
    renderPicker()

    await screen.findByRole('option', { name: 'NCR – National Capital Region' }, { timeout: 5000 })
    await user.selectOptions(screen.getByLabelText('Region'), '130000000')
    const city = screen.getByLabelText('City / Municipality')
    await waitFor(() => expect(city).toBeEnabled())
    expect(screen.getByLabelText('Province')).toBeDisabled()

    await user.selectOptions(city, '137404000')
    expect(latest).toMatchObject({
      display: '',
      provinceCode: '',
      cityCode: '137404000',
    })
  })

  it('falls back to a free-text input when the PSGC service is unreachable', async () => {
    mockPsgc({ failAll: true })
    const user = userEvent.setup()
    renderPicker({ error: 'Select the place of birth' })

    const input = await screen.findByRole('textbox', { name: /place of birth/i })
    expect(screen.getByText(/couldn.t load the list of places/i)).toBeInTheDocument()
    expect(screen.getByText('Select the place of birth')).toBeInTheDocument()

    await user.type(input, 'Malolos')
    expect(latest).toEqual({ ...EMPTY, display: 'Malolos' })
  })

  it('fetches the region list once and reuses it across remounts', async () => {
    const fetchMock = mockPsgc()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = (
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    )
    const { unmount } = render(tree)
    await screen.findByRole('option', { name: 'Region III – Central Luzon' }, { timeout: 5000 })
    unmount()
    render(tree)
    await screen.findByRole('option', { name: 'Region III – Central Luzon' }, { timeout: 5000 })

    const regionCalls = fetchMock.mock.calls.filter(([u]: [RequestInfo | URL]) => String(u).endsWith('/regions.json'))
    expect(regionCalls).toHaveLength(1)
  })
})
