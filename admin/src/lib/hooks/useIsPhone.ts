import { useEffect, useState } from 'react'

const QUERY = '(max-width: 767px)'
const read = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : false)

/** True below 768 px, where the admin portal swaps its sidebar for a bottom bar. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(read)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(QUERY)
    const onChange = () => setPhone(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return phone
}
