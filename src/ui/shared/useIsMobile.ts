/**
 * useIsMobile — true on phone-width viewports (the same `max-width: 768px`
 * breakpoint the stylesheet uses to switch drawers/sheets to full-width). Drives
 * the inline-vs-bottom-sheet choice in {@link SheetField}. SSR/jsdom-safe: when
 * `matchMedia` is unavailable it reports desktop (false).
 */
import { useEffect, useState } from 'react'

export const MOBILE_QUERY = '(max-width: 768px)'

function read(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(query).matches
}

export function useIsMobile(query: string = MOBILE_QUERY): boolean {
  const [isMobile, setIsMobile] = useState(() => read(query))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setIsMobile(mql.matches)
    onChange() // sync in case the viewport changed between render and effect
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return isMobile
}
