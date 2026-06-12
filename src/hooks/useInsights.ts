import { useEffect, useState } from 'react'
import { insights } from '../worker/client'
import { useDebouncedValue } from './useDebouncedValue'
import type { SimulationInputs } from '../schema'
import type { Insight } from '../sim/insights'

export interface InsightsState {
  /** Insight cards (possibly empty — every rule may decline); null until first solve. */
  data: Insight[] | null
  loading: boolean
}

/**
 * Compute the rule-based insight cards whenever inputs settle. The comparative
 * rules re-run Monte Carlo at full resolution and gate on statistical
 * significance, so this is debounced and cancellation-safe like the solvers.
 */
export function useInsights(
  inputs: SimulationInputs | null,
  runCount = 1000,
): InsightsState {
  const debounced = useDebouncedValue(inputs, 350)
  const [data, setData] = useState<Insight[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!debounced) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    insights(debounced, runCount)
      .then((cards) => {
        if (cancelled) return
        setData(cards)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, runCount])

  return { data, loading }
}
