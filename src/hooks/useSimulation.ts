import { useEffect, useRef, useState } from 'react'
import type { MonteCarloResult, ProgressEvent } from '../sim/montecarlo'
import type { SimulationInputs } from '../schema'
import { simulate } from '../worker/client'
import { getCache, setCache } from '../storage/cache'

export interface SimulationState {
  result: MonteCarloResult | null
  loading: boolean
  stale: boolean
  error: Error | null
  /** Latest progress event from the worker; undefined when no run is active. */
  progress: ProgressEvent | undefined
}

/**
 * React hook that runs the Monte Carlo simulation with IDB caching.
 *
 * On each inputs change:
 *   1. Mark existing result as `stale` immediately (UX: show stale chart).
 *   2. Check IDB cache — if hit, resolve instantly (no loading flash).
 *   3. Cache miss → run simulation → store in IDB cache.
 *
 * Cancels any in-flight run when inputs change or the component unmounts.
 */
export function useSimulation(inputs: SimulationInputs | null): SimulationState {
  const [result, setResult] = useState<MonteCarloResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [progress, setProgress] = useState<ProgressEvent | undefined>(undefined)

  // Track whether the effect's cleanup has run (cancellation)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!inputs) {
      setLoading(false)
      setStale(false)
      setProgress(undefined)
      return
    }

    cancelledRef.current = false

    // Mark existing result as stale right away so the UI can show
    // a "stale" overlay on the previous chart while recomputing.
    setStale(true)
    setError(null)
    setProgress(undefined)

    let didCancel = false

    async function run() {
      // 1. Try cache first — zero loading flash on cache hit
      try {
        const cached = await getCache(inputs!)
        if (didCancel) return
        if (cached) {
          setResult(cached)
          setStale(false)
          setLoading(false)
          return
        }
      } catch {
        // IDB unavailable — fall through to compute
      }

      // 2. Cache miss: show loading and compute
      if (!didCancel) setLoading(true)

      try {
        const res = await simulate(inputs!, 1000, (p) => {
          if (didCancel) return
          setProgress(p)
        })
        if (didCancel) return
        // 3. Store in cache async (fire-and-forget; don't block UI)
        setCache(inputs!, res).catch(() => {})
        setResult(res)
        setStale(false)
        setLoading(false)
      } catch (err: unknown) {
        if (didCancel) return
        setError(err instanceof Error ? err : new Error(String(err)))
        setStale(false)
        setLoading(false)
      }
    }

    void run()

    return () => {
      didCancel = true
      cancelledRef.current = true
    }
  }, [inputs])

  return { result, loading, stale, error, progress }
}
