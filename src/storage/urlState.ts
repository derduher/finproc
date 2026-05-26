/**
 * URL state: compress/decompress SimulationInputs to/from a URL-safe string.
 * Uses lz-string's compressToEncodedURIComponent for compact, shareable URLs.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { z } from 'zod'
import { SimulationInputsSchema } from '../schema'
import type { SimulationInputs } from '../schema'

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
  try {
    const json = decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    const parsed = JSON.parse(json)
    const result = SimulationInputsSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
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
  try {
    const json = decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    const parsed = JSON.parse(json)
    const result = UiPrefsSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}
