/** Full-page navigation to another origin (e.g. PayMongo's hosted GCash
 * checkout). Wrapped in its own module so tests can mock it — jsdom doesn't
 * implement real navigation. */
export function redirectTo(url: string): void {
  window.location.assign(url)
}
