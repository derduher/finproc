import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Measures the rendered width of an element so a fixed-size SVG chart can be
 * laid out to fit its container (the charts compute their own x/y scales from a
 * `width` prop, so re-laying out beats CSS-scaling, which would shrink text).
 *
 * Returns a ref to attach and the latest measured width, falling back to
 * `fallback` before the first measurement or where ResizeObserver is absent
 * (e.g. jsdom).
 */
export function useContainerWidth<T extends HTMLElement>(fallback = 1320): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = (w: number) => {
      if (w > 0) setWidth(Math.round(w))
    }
    measure(el.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w != null) measure(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, width]
}
