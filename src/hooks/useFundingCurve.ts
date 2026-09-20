import { useEffect, useState } from 'react'
import { fundingCurve } from '../worker/client'
import { getFundingCache, setFundingCache } from '../storage/cache'
import { useDebouncedValue } from './useDebouncedValue'
import type { FundingCurveResult, FundingProgress } from '../sim/fundingCurve'
import type { SimulationInputs } from '../schema'

/** Runs per age. Enough for a stable 90th percentile without a long solve. */
export const FUNDING_RUN_COUNT = 200

export interface FundingCurveState {
  /** Last solved curve; null until the first one lands. */
  curve: FundingCurveResult | null
  loading: boolean
  /** Inputs have moved on but the displayed curve hasn't caught up yet. */
  stale: boolean
  progress: FundingProgress | undefined
}

/**
 * Solve the funding curve off the main thread, with IDB caching.
 *
 * This is the heaviest thing on the screen — an accumulation pass plus a per-run
 * bisection at every age — so it follows `useSimulation`'s shape: flag the old
 * curve stale immediately, wait 350ms for typing to settle, try the cache, and
 * only then solve. The previous curve stays on screen throughout; a chart that
 * blanks for several seconds on every keystroke is worse than a slightly old one.
 */
export function useFundingCurve(
  inputs: SimulationInputs | null,
  runCount: number = FUNDING_RUN_COUNT,
): FundingCurveState {
  const [curve, setCurve] = useState<FundingCurveResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [stale, setStale] = useState(false)
  const [progress, setProgress] = useState<FundingProgress | undefined>(undefined)

  useEffect(() => {
    if (!inputs) return
    setStale(true)
    setProgress(undefined)
  }, [inputs])

  const debounced = useDebouncedValue(inputs, 350)

  useEffect(() => {
    if (!debounced) {
      setLoading(false)
      setStale(false)
      setProgress(undefined)
      return
    }
    let cancelled = false

    async function solve(plan: SimulationInputs) {
      try {
        const cached = await getFundingCache(plan, runCount)
        if (cancelled) return
        if (cached) {
          setCurve(cached)
          setStale(false)
          setLoading(false)
          return
        }
      } catch {
        // IDB unavailable — solve it instead.
      }
      if (cancelled) return

      setLoading(true)
      try {
        const solved = await fundingCurve(plan, { runCount }, (p) => {
          if (!cancelled) setProgress(p)
        })
        if (cancelled) return
        setFundingCache(plan, runCount, solved).catch(() => {})
        setCurve(solved)
        setStale(false)
        setLoading(false)
      } catch {
        if (cancelled) return
        // Keep the last good curve on screen rather than blanking the section.
        setStale(false)
        setLoading(false)
      }
    }

    void solve(debounced)
    return () => {
      cancelled = true
    }
  }, [debounced, runCount])

  return { curve, loading, stale, progress }
}
