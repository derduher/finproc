import { useEffect, useState } from 'react'
import { sustainableSpend } from '../worker/simulator'
import type { SimulationInputs } from '../schema'

export interface SustainableSpendState {
  /** Sustainable annual spend (today's $) at the target confidence; null until solved. */
  spend: number | null
  /** Success rate achieved at that spend. */
  successRate: number | null
  loading: boolean
}

/**
 * Solve for the headline "spending you can sustain" off the main thread.
 *
 * Runs at a modest `runCount` (the solver itself does many MC passes), re-solving
 * whenever inputs or the target confidence change, and cancels stale solves.
 */
export function useSustainableSpend(
  inputs: SimulationInputs | null,
  target = 0.9,
  runCount = 200,
): SustainableSpendState {
  const [spend, setSpend] = useState<number | null>(null)
  const [successRate, setSuccessRate] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!inputs) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    sustainableSpend(inputs, target, { runCount })
      .then((res) => {
        if (cancelled) return
        setSpend(res.spend)
        setSuccessRate(res.successRate)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [inputs, target, runCount])

  return { spend, successRate, loading }
}
