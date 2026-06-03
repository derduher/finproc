/**
 * IndexedDB-backed cache for Monte Carlo results.
 * Key = djb2 hash of the JSON-serialised SimulationInputs.
 * Fast enough for our use-case; no crypto dependency needed.
 */
import { get, set } from 'idb-keyval'
import type { SimulationInputs } from '../schema'
import type { MonteCarloResult } from '../sim/montecarlo'

/**
 * djb2 hash — fast non-cryptographic string hash.
 * Returns a hex string so it's URL/IDB-safe.
 */
function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16)
}

/** Stable JSON key — undefined values are dropped, object keys are sorted. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .filter(([, val]) => val !== undefined),
      )
    }
    return v
  })
}

/**
 * Output-shape version. Bump whenever `MonteCarloResult` gains/changes fields so
 * that entries written by an older build (missing e.g. `samplePaths`,
 * `p90EndBalance`, `shortfallByPercentile`) are never served to newer UI.
 */
const CACHE_VERSION = 2

/** Derive a deterministic cache key from simulation inputs. */
export function getCacheKey(inputs: SimulationInputs): string {
  return `mc:v${CACHE_VERSION}:${djb2(stableJson(inputs))}`
}

/** Retrieve a cached result, or undefined on miss. */
export async function getCache(inputs: SimulationInputs): Promise<MonteCarloResult | undefined> {
  return get<MonteCarloResult>(getCacheKey(inputs))
}

/** Store a simulation result. */
export async function setCache(inputs: SimulationInputs, result: MonteCarloResult): Promise<void> {
  await set(getCacheKey(inputs), result)
}
