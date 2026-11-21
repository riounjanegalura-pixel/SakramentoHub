/**
 * Masks an email's local-part for display so a user can recognize their own
 * account without the full address being shown — e.g. on a reset-password
 * or verify-email link, before they've proven they own the inbox it went to.
 * Keeps the first character, masks the rest of the local-part, keeps the
 * domain as-is: `rio@example.com` -> `r***@example.com`.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return email

  const local = email.slice(0, at)
  const domain = email.slice(at)
  return `${local[0]}***${domain}`
}
