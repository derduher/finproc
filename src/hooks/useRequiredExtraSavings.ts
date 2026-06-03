import { useEffect, useState } from 'react'
import { requiredExtraSavings } from '../worker/simulator'
import { useDebouncedValue } from './useDebouncedValue'
import type { SimulationInputs } from '../schema'

export interface RequiredExtraSavingsState {
  /** Extra monthly contribution needed to hit the target; null until solved. */
  extraMonthly: number | null
  loading: boolean
}

/**
 * Solve for the extra monthly saving that would make the plan work (#10 family).
 *
 * Gated by `enabled` so we don't pay for a third Monte Carlo solver unless it's
 * actually relevant (i.e. the plan is currently underfunded). Inputs are
 * debounced and stale solves are cancelled.
 */
export function useRequiredExtraSavings(
  inputs: SimulationInputs | null,
  enabled: boolean,
  target = 0.9,
  runCount = 200,
): RequiredExtraSavingsState {
  const debounced = useDebouncedValue(inputs, 350)
  const [extraMonthly, setExtraMonthly] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!debounced || !enabled) {
      setLoading(false)
      setExtraMonthly(null)
      return
    }
    let cancelled = false
    setLoading(true)
    requiredExtraSavings(debounced, target, { runCount })
      .then((res) => {
        if (cancelled) return
        setExtraMonthly(res.extraMonthly)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, enabled, target, runCount])

  return { extraMonthly, loading }
}
