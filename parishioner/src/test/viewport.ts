/** Test helper: fakes window.matchMedia for `(min-width: Npx)` queries at a chosen viewport width. */
export function setViewport(width: number): { resize(width: number): void } {
  const listeners = new Set<() => void>()
  let current = width
  window.matchMedia = ((query: string) => {
    const m = /min-width:\s*(\d+)px/.exec(query)
    return {
      media: query,
      get matches() {
        return m ? current >= Number(m[1]) : false
      },
      addEventListener: (_type: string, cb: () => void) => void listeners.add(cb),
      removeEventListener: (_type: string, cb: () => void) => void listeners.delete(cb),
    }
  }) as unknown as typeof window.matchMedia
  return {
    resize(next: number) {
      current = next
      listeners.forEach((cb) => cb())
    },
  }
}
