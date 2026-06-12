import { useEffect, useState } from 'react'
import type { MonteCarloResult, ProgressEvent } from '../sim/montecarlo'
import type { SimulationInputs } from '../schema'
import { simulate } from '../worker/client'
import { getCache, setCache } from '../storage/cache'
import { useDebouncedValue } from './useDebouncedValue'

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
 *   2. Once typing settles (350ms debounce, leading value on mount), check
 *      IDB cache — if hit, resolve instantly (no loading flash).
 *   3. Cache miss → run simulation → store in IDB cache.
 *
 * The debounce matches the solver hooks: without it, every keystroke that
 * misses the cache posts a 1,000-run sim to the shared worker, and the run
 * the user actually wants queues behind abandoned ones (React-side
 * cancellation can't recall a message already sent to the worker).
 *
 * Cancels any in-flight run when inputs change or the component unmounts.
 */
export function useSimulation(inputs: SimulationInputs | null): SimulationState {
  const [result, setResult] = useState<MonteCarloResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [progress, setProgress] = useState<ProgressEvent | undefined>(undefined)

  // Mark existing result as stale the moment inputs change — the recompute
  // below waits for typing to settle, but the UI's stale overlay shouldn't.
  useEffect(() => {
    if (!inputs) return
    setStale(true)
    setError(null)
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

    let didCancel = false

    async function run() {
      // 1. Try cache first — zero loading flash on cache hit
      try {
        const cached = await getCache(debounced!)
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
      if (didCancel) return

      // 2. Cache miss: show loading and compute
      setLoading(true)

      try {
        const res = await simulate(debounced!, 1000, (p) => {
          if (didCancel) return
          setProgress(p)
        })
        if (didCancel) return
        // 3. Store in cache async (fire-and-forget; don't block UI)
        setCache(debounced!, res).catch(() => {})
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
    }
  }, [debounced])

  return { result, loading, stale, error, progress }
}
