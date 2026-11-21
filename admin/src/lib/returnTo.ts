export const DEFAULT_LANDING = '/dashboard'

/** Pages that must never be a return target: signing in again from them would loop or land somewhere meaningless. */
const AUTH_PAGES = ['/login', '/forgot-password', '/reset-password']

/**
 * Where to go after signing in. Only a plain in-app path is accepted: exactly one leading `/`,
 * no `//` or `/\`, no scheme or host, no control characters, and not one of the sign-in pages.
 * Anything else (including a value that is not a string) becomes the default landing page, so a
 * crafted link can never send a freshly signed-in staff member to another site.
 */
export function safeReturnTarget(raw: unknown): string {
  if (typeof raw !== 'string' || raw === '') return DEFAULT_LANDING
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_LANDING
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(raw) || raw.includes('://')) return DEFAULT_LANDING

  const pathname = raw.split(/[?#]/)[0].replace(/\/+$/, '')
  if (AUTH_PAGES.includes(pathname)) return DEFAULT_LANDING

  return raw
}
