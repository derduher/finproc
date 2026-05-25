import { useCallback, useEffect, useRef, useState } from 'react'
import { compressInputs, decompressInputs } from '../storage/urlState'
import type { SimulationInputs } from '../schema'

const URL_PARAM = 's'
const DEBOUNCE_MS = 500

export interface UrlSyncResult {
  initialInputs: SimulationInputs | null
  syncToUrl: (inputs: SimulationInputs) => void
}

export function useUrlSync(): UrlSyncResult {
  const [initialInputs] = useState<SimulationInputs | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const encoded = params.get(URL_PARAM)
      return encoded ? decompressInputs(encoded) : null
    } catch {
      return null
    }
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const syncToUrl = useCallback((inputs: SimulationInputs) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const encoded = compressInputs(inputs)
      const params = new URLSearchParams(window.location.search)
      params.set(URL_PARAM, encoded)
      window.history.pushState(null, '', `?${params.toString()}`)
      timerRef.current = null
    }, DEBOUNCE_MS)
  }, [])

  return { initialInputs, syncToUrl }
}
