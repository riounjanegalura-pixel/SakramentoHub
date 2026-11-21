import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveBlob } from './download'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('saveBlob', () => {
  it('clicks a temporary download link and revokes the object URL afterwards', () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:csv')
    const revoke = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL: create, revokeObjectURL: revoke })
    let downloaded = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = `${this.download}|${this.href}`
    })

    saveBlob(new Blob(['a']), 'bookings.csv')

    expect(create).toHaveBeenCalledTimes(1)
    expect(downloaded).toBe('bookings.csv|blob:csv')
    expect(document.querySelector('a[download]')).toBeNull() // the temporary link is removed
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:csv')
  })
})
