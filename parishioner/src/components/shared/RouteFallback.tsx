/** Shown while a screen's chunk loads. A quiet skeleton: token colours only, no motion. */
export function RouteFallback() {
  return (
    <div aria-busy="true" className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col gap-4 bg-paper p-6">
      <span className="sr-only">Loading</span>
      <div aria-hidden="true" className="h-6 w-1/2 rounded-md bg-line" />
      <div aria-hidden="true" className="h-24 w-full rounded-md bg-line" />
      <div aria-hidden="true" className="h-24 w-full rounded-md bg-line" />
    </div>
  )
}
