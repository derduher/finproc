import { useCallback, useEffect, useRef, useState } from 'react'
import {
  compressInputs,
  compressUiPrefs,
  decompressInputs,
  decompressUiPrefs,
} from '../storage/urlState'
import type { UiPrefs } from '../storage/urlState'
import type { SimulationInputs } from '../schema'

const URL_PARAM_INPUTS = 's'
const URL_PARAM_UI = 'ui'
const DEBOUNCE_MS = 500

export interface UrlSyncResult {
  initialInputs: SimulationInputs | null
  initialUiPrefs: UiPrefs | null
  /**
   * Debounce-write the inputs (and optional UI prefs) to the URL.
   * `onCommit` fires once after the debounced write actually lands —
   * use it to record "auto-saved Ns ago" in the store.
   */
  syncToUrl: (
    inputs: SimulationInputs,
    uiPrefs?: UiPrefs,
    onCommit?: () => void,
  ) => void
}

function readParam(name: string): string | null {
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get(name)
  } catch {
    return null
  }
}

export function useUrlSync(): UrlSyncResult {
  const [initialInputs] = useState<SimulationInputs | null>(() => {
    const encoded = readParam(URL_PARAM_INPUTS)
    return encoded ? decompressInputs(encoded) : null
  })

  const [initialUiPrefs] = useState<UiPrefs | null>(() => {
    const encoded = readParam(URL_PARAM_UI)
    return encoded ? decompressUiPrefs(encoded) : null
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const syncToUrl = useCallback(
    (inputs: SimulationInputs, uiPrefs?: UiPrefs, onCommit?: () => void) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const params = new URLSearchParams(window.location.search)
        params.set(URL_PARAM_INPUTS, compressInputs(inputs))
        if (uiPrefs) params.set(URL_PARAM_UI, compressUiPrefs(uiPrefs))
        window.history.pushState(null, '', `?${params.toString()}`)
        timerRef.current = null
        onCommit?.()
      }, DEBOUNCE_MS)
    },
    [],
  )

  return { initialInputs, initialUiPrefs, syncToUrl }
}
