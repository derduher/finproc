import { useEffect, useState } from 'react'

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` of quiet.
 *
 * Used to throttle the expensive Monte Carlo solvers (sustainable spend, earliest
 * retirement age) so they re-run once typing settles rather than on every
 * keystroke. The leading value is returned immediately on mount.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])

  return debounced
}
