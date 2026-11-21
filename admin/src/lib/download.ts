/** Saves an in-memory file (e.g. the authenticated CSV blob) through a temporary download link. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0) // timer: object URL cleanup, not animation
}

/** Opens markup fetched through the authenticated client in a new tab via a blob: URL (a plain link cannot send the bearer token). */
export function openHtmlInNewTab(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  window.open(url, '_blank', 'noopener,noreferrer')
}
