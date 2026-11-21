// Shared jsdom gaps for every test file.
// jsdom does not implement pointer capture; vaul's Drawer calls setPointerCapture on pointerdown, which threw
// an uncaught TypeError (Vitest reports it as an unhandled error and exits non-zero even when tests pass).
if (typeof Element !== 'undefined') {
  const proto = Element.prototype as unknown as Record<string, unknown>
  for (const name of ['setPointerCapture', 'releasePointerCapture'] as const) {
    if (typeof proto[name] !== 'function') proto[name] = () => {}
  }
  if (typeof proto.hasPointerCapture !== 'function') proto.hasPointerCapture = () => false
}
