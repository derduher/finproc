import { useEffect, useState } from 'react'
import { earliestRetirementAge } from '../worker/client'
import { useDebouncedValue } from './useDebouncedValue'
import type { SimulationInputs } from '../schema'

export interface EarliestRetirementState {
  /** Earliest retirement age meeting the target confidence; null until solved, undefined if unreachable. */
  age: number | null | undefined
  /** Success rate achieved at that age. */
  successRate: number | null
  loading: boolean
}

/**
 * Solve for the earliest age the person could retire at their current target
 * spend and still meet the confidence target (#10) — the companion to
 * `useSustainableSpend` (which holds the age and solves spend instead).
 *
 * Inputs are debounced so the solver re-runs once edits settle, not on every
 * keystroke, and stale solves are cancelled.
 */
export function useEarliestRetirementAge(
  inputs: SimulationInputs | null,
  target = 0.9,
  runCount = 200,
): EarliestRetirementState {
  const debounced = useDebouncedValue(inputs, 350)
  const [age, setAge] = useState<number | null | undefined>(null)
  const [successRate, setSuccessRate] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!debounced) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    earliestRetirementAge(debounced, target, { runCount })
      .then((res) => {
        if (cancelled) return
        setAge(res ? res.age : undefined)
        setSuccessRate(res ? res.successRate : null)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, target, runCount])

  return { age, successRate, loading }
}
