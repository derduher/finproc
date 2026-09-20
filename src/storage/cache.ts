/**
 * IndexedDB-backed cache for Monte Carlo results.
 * Key = djb2 hash of the JSON-serialised SimulationInputs.
 * Fast enough for our use-case; no crypto dependency needed.
 */
import { get, set } from 'idb-keyval'
import type { SimulationInputs } from '../schema'
import type { MonteCarloResult } from '../sim/montecarlo'
import type { FundingCurveResult } from '../sim/fundingCurve'

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
 * Output-shape version. Bump whenever `MonteCarloResult` gains/changes fields, or
 * when the simulation math changes so prior results would be stale, so that
 * entries written by an older build are never served to newer UI.
 * v3: cumulative-inflation fix (flows now track the realized price level).
 * v4: AR(1) serial correlation in return/inflation sampling (paths, not marginals).
 * v5: progressive withdrawal-phase tax (brackets, std deduction, partial SS, LTCG 0%).
 * v6: optional stochastic longevity (per-run age at death); `longevity` field added.
 * v7: return↔inflation correlation in the sampler (negative; joint path only).
 * v8: IRS contributeMax limits grow with COLA + 50+ catch-up (was frozen nominal).
 * v9: guardrails cuts bounded by the essential-expense floor (was unbounded).
 */
const CACHE_VERSION = 9

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

/**
 * Funding-curve cache version. Separate namespace from the Monte Carlo cache:
 * the two have unrelated output shapes and change for different reasons, so a
 * shared counter would throw away good entries on every bump.
 */
const FUNDING_CACHE_VERSION = 1

/**
 * Cache key for a funding curve. `runCount` is part of the key because it sets
 * the curve's resolution — a 24-run curve and a 200-run curve of the same plan
 * are different answers, not the same one at different speeds.
 */
export function getFundingCacheKey(inputs: SimulationInputs, runCount: number): string {
  return `fc:v${FUNDING_CACHE_VERSION}:${runCount}:${djb2(stableJson(inputs))}`
}

/** Retrieve a cached funding curve, or undefined on miss. */
export async function getFundingCache(
  inputs: SimulationInputs,
  runCount: number,
): Promise<FundingCurveResult | undefined> {
  return get<FundingCurveResult>(getFundingCacheKey(inputs, runCount))
}

/** Store a solved funding curve. */
export async function setFundingCache(
  inputs: SimulationInputs,
  runCount: number,
  result: FundingCurveResult,
): Promise<void> {
  await set(getFundingCacheKey(inputs, runCount), result)
}
