/**
 * URL state: compress/decompress SimulationInputs to/from a URL-safe string.
 * Uses lz-string's compressToEncodedURIComponent for compact, shareable URLs.
 *
 * Decode is defensive — tries EncodedURIComponent first, then falls back to
 * Base64 in case the payload was produced (or mangled) by another encoder.
 */
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
  decompressFromBase64,
} from 'lz-string'
import { z } from 'zod'
import { SimulationInputsSchema } from '../schema'
import type { SimulationInputs } from '../schema'

/**
 * Try each decoder + JSON.parse together. The two alphabets overlap enough
 * that the wrong decoder may return non-null garbage; only the one whose
 * output parses as JSON is the real producer. Returns null if neither works.
 */
function tryDecodeAndParse(encoded: string): unknown | null {
  const candidates = [
    decompressFromEncodedURIComponent(encoded),
    decompressFromBase64(encoded),
  ]
  for (const json of candidates) {
    if (!json) continue
    try {
      return JSON.parse(json)
    } catch {
      // wrong decoder produced garbage that isn't JSON — try the next one
    }
  }
  return null
}

/** Max URL length for "shareable" links (conservative HTTP limit). */
const MAX_SHAREABLE_LENGTH = 8000

/** Compact UI preferences persisted alongside the scenario URL. */
const UiPrefsSchema = z.object({
  aesthetic: z.enum(['warm', 'cool', 'mono']),
  theme: z.enum(['light', 'dark']),
  density: z.enum(['compact', 'comfortable']),
})

export type UiPrefs = z.infer<typeof UiPrefsSchema>

/** Compress inputs to a URL-safe string. */
export function compressInputs(inputs: SimulationInputs): string {
  return compressToEncodedURIComponent(JSON.stringify(inputs))
}

/**
 * Decompress a URL string back to SimulationInputs.
 * Returns null if the string is invalid or fails Zod validation.
 */
export function decompressInputs(encoded: string): SimulationInputs | null {
  const parsed = tryDecodeAndParse(encoded)
  if (parsed === null) return null
  const result = SimulationInputsSchema.safeParse(parsed)
  return result.success ? result.data : null
}

/** Returns true if the encoded string is short enough for a shareable URL. */
export function isShareable(encoded: string): boolean {
  return encoded.length < MAX_SHAREABLE_LENGTH
}

/** Compress UI prefs (aesthetic / theme / density) to a URL-safe string. */
export function compressUiPrefs(prefs: UiPrefs): string {
  return compressToEncodedURIComponent(JSON.stringify(prefs))
}

/** Decompress UI prefs; returns null on parse or validation failure. */
export function decompressUiPrefs(encoded: string): UiPrefs | null {
  const parsed = tryDecodeAndParse(encoded)
  if (parsed === null) return null
  const result = UiPrefsSchema.safeParse(parsed)
  return result.success ? result.data : null
}
