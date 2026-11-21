/**
 * Simulates network latency for mock API calls. Defaults to a random delay
 * in the 300-800ms range so the app "feels" like it's calling a real backend.
 */
export function simulateLatency(ms = 300 + Math.random() * 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms)) // timer: simulated latency, not animation
}

/**
 * Simulates a random failure at the given rate (0-1). Callers use this to
 * decide whether to throw an error, so every mock fetch has a way to
 * exercise error states.
 */
export function simulateFailure(rate: number): boolean {
  return Math.random() < rate
}

/**
 * The failure rate every mock module uses when calling `simulateFailure`.
 * Reads from `VITE_MOCK_FAILURE_RATE` and defaults to `0` so tests and
 * normal dev flows are deterministic by default.
 *
 * This is the one knob that controls error simulation across the whole
 * mock layer: set `VITE_MOCK_FAILURE_RATE=1` in `.env.local` to force every
 * mock fetch to fail (useful for exercising error UI), or override
 * `import.meta.env.VITE_MOCK_FAILURE_RATE` per-test in Vitest to assert a
 * specific mock function actually rejects when the rate is nonzero.
 */
export function getFailureRate(): number {
  return Number(import.meta.env.VITE_MOCK_FAILURE_RATE ?? 0)
}
