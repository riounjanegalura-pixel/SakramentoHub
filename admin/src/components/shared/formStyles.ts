/**
 * A native <select> dressed like the kit's Input (44 px, token border, focus ring, invalid ring).
 * The kit's Select is a Radix popover; forms that rely on a real <select> (label association,
 * selectOptions, mobile pickers) use this class instead.
 */
export const nativeSelectClass =
  'min-h-[44px] w-full min-w-0 rounded-xl border border-input-border bg-surface px-3 py-2 text-base text-ink outline-none md:text-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger disabled:cursor-not-allowed disabled:opacity-50'
