import { useMutation } from '@tanstack/react-query'
import { exportMyData } from '../../lib/data/account'

/** Real download, not console.log — a blob URL fed through a hidden,
 * click-triggered <a download> is the standard way to save an in-memory
 * response as a file without a server-rendered redirect. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** "Export My Data" for both the phone and the desktop settings: fetch, then save the file. */
export function useExportMyData() {
  return useMutation({
    mutationFn: exportMyData,
    onSuccess: (blob: Blob) => downloadBlob(blob, 'sakramentohub-my-data.json'),
  })
}
