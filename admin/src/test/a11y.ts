import axe from 'axe-core'

type A11yOptions = {
  /**
   * True when the container holds a whole page (header, main, nav). Leaves the
   * `region` landmark rule on. Default false: a fragment has no landmarks of
   * its own, so `region` is disabled for it.
   */
  fullPage?: boolean
}

/**
 * Runs axe-core (WCAG 2.0/2.1/2.2 A and AA) on a rendered container and throws
 * an Error listing every violation as `rule-id (impact): target — help`.
 *
 * Rules disabled, and why:
 * - `color-contrast`: jsdom cannot compute layout or painted colours, so the
 *   rule cannot give a true answer there. Contrast is covered by the tokens
 *   test and the browser run.
 * - `region`: only when the fragment is not a full page (see `fullPage`).
 *
 * Nothing is disabled per screen; violations are fixed in the markup.
 */
export async function expectNoA11yViolations(
  container: HTMLElement,
  { fullPage = false }: A11yOptions = {},
): Promise<void> {
  const rules: Record<string, { enabled: boolean }> = {
    'color-contrast': { enabled: false },
  }
  if (!fullPage) rules.region = { enabled: false }

  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    rules,
  })

  if (results.violations.length === 0) return

  const lines = results.violations.flatMap((v) =>
    v.nodes.map(
      (n) => `${v.id} (${v.impact ?? 'unknown'}): ${n.target.join(' ')} — ${v.help}`,
    ),
  )
  throw new Error(
    `${results.violations.length} accessibility violation(s):\n${lines.join('\n')}`,
  )
}
