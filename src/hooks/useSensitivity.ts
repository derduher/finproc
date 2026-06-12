import { useEffect, useState } from 'react'
import { sensitivity } from '../worker/client'
import { useDebouncedValue } from './useDebouncedValue'
import type { SimulationInputs, SensitivityResult } from '../schema'

export interface SensitivityState {
  /** Tornado rows sorted by descending impact; null until first solve. */
  data: SensitivityResult[] | null
  loading: boolean
}

/**
 * Run the OAT ±20% sensitivity sweep (the tornado) whenever inputs settle.
 * Debounced and cancellation-safe, mirroring the solver hooks.
 */
export function useSensitivity(
  inputs: SimulationInputs | null,
  runCount = 200,
): SensitivityState {
  const debounced = useDebouncedValue(inputs, 350)
  const [data, setData] = useState<SensitivityResult[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!debounced) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    sensitivity(debounced, runCount)
      .then((rows) => {
        if (cancelled) return
        setData(rows)
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
