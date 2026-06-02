import { runMonteCarlo } from './montecarlo'
import type { SimulationInputs } from '../schema'

export interface SustainableSpendResult {
  /** Highest annual spend (today's $, like `annualExpenses`) sustainable at the target confidence */
  spend: number
  /** Success rate (0..1) achieved at that spend */
  successRate: number
}

/**
 * Find the HIGHEST annual spend whose Monte Carlo success rate still meets
 * `targetSuccessRate` (a fraction, 0..1) — the "spending you can sustain" figure
 * that replaces a binary success number as the headline.
 *
 * Assumes success rate is monotonically non-increasing in spend (spending more
 * never improves your odds), so we bracket the crossing and bisect it. The seed
 * is fixed so every candidate is evaluated on the same set of market draws
 * (common random numbers), which keeps the search stable.
 *
 * `spend` is in today's dollars, matching `inputs.annualExpenses`.
 */
export function findSustainableSpend(
  inputs: SimulationInputs,
  targetSuccessRate: number,
  opts?: { runCount?: number; tolerance?: number },
): SustainableSpendResult {
  const runCount = opts?.runCount ?? 300
  // Resolve spend to within this many dollars/yr.
  const tolerance = opts?.tolerance ?? 500

  const successAt = (spend: number): number =>
    runMonteCarlo({ ...inputs, annualExpenses: spend }, runCount, inputs.seed).successRate

  // Spending nothing never depletes, so lo always meets the target.
  let lo = 0
  // Grow hi until the target is missed (or we hit a sane ceiling).
  let hi = Math.max(inputs.annualExpenses, 1000)
  let guard = 0
  while (successAt(hi) >= targetSuccessRate && guard++ < 24) {
    hi *= 2
  }
  // Even an enormous spend holds the target (e.g. target ~0): return that ceiling.
  if (successAt(hi) >= targetSuccessRate) {
    return { spend: hi, successRate: successAt(hi) }
  }

  // Bisect the crossing in [lo, hi]; lo always holds the target, hi never does.
  while (hi - lo > tolerance) {
    const mid = (lo + hi) / 2
    if (successAt(mid) >= targetSuccessRate) lo = mid
    else hi = mid
  }

  return { spend: lo, successRate: successAt(lo) }
}
