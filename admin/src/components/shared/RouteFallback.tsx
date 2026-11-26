/** Shown while a screen's chunk loads. A quiet skeleton: token colours only, no motion. */
export function RouteFallback() {
  return (
    <div aria-busy="true" className="flex min-h-dvh flex-col gap-4 bg-surface p-8">
      <span className="sr-only">Loading</span>
      <div aria-hidden="true" className="h-7 w-1/3 rounded-md bg-line" />
      <div aria-hidden="true" className="h-32 w-full rounded-md bg-line" />
      <div aria-hidden="true" className="h-32 w-full rounded-md bg-line" />
    </div>
  )
}
