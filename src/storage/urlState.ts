/**
 * URL state: compress/decompress SimulationInputs to/from a URL-safe string.
 * Uses lz-string's compressToEncodedURIComponent for compact, shareable URLs.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { SimulationInputsSchema } from '../schema'
import type { SimulationInputs } from '../schema'

/** Max URL length for "shareable" links (conservative HTTP limit). */
const MAX_SHAREABLE_LENGTH = 8000

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
