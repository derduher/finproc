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
   * True when the URL had an `?s=` param but it failed to decode/validate.
   * The app uses this to show a non-blocking "couldn't load shared scenario"
   * banner; it's false when there was no param at all (fresh visit).
   */
  inputsParseFailed: boolean
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
  // Capture the raw param presence + the parse result in a single mount-time
  // snapshot. If `?s=` was present but decode failed, callers can surface a
  // "couldn't load shared scenario" banner.
  const [initial] = useState<{
    inputs: SimulationInputs | null
    inputsParseFailed: boolean
  }>(() => {
    const encoded = readParam(URL_PARAM_INPUTS)
    if (!encoded) return { inputs: null, inputsParseFailed: false }
    const decoded = decompressInputs(encoded)
    return { inputs: decoded, inputsParseFailed: decoded === null }
  })
  const initialInputs = initial.inputs
  const inputsParseFailed = initial.inputsParseFailed

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

  return { initialInputs, initialUiPrefs, inputsParseFailed, syncToUrl }
}
