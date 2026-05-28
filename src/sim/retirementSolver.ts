import { runMonteCarlo } from './montecarlo'
import { withRetirementAge } from './retirementAge'
import type { SimulationInputs } from '../schema'

export interface RetirementSolveResult {
  /** The earliest retirement age whose success rate meets the target */
  age: number
  /** The success rate (0..1) achieved at that age */
  successRate: number
}

/**
 * Find the EARLIEST retirement age at which the plan's Monte Carlo success rate
 * meets or exceeds `targetSuccessRate` (a fraction, 0..1).
 *
 * Assumes success rate is monotonically non-decreasing in retirement age — i.e.
 * retiring later never hurts your odds (more contributions, fewer drawdown years).
 * This lets us binary-search the age range instead of scanning every year.
 *
 * Returns undefined if even retiring at maxAge can't reach the target.
 *
 * Each candidate is evaluated by re-running the simulation with the retirement
 * age cascaded onto accounts (see `withRetirementAge`). The seed is fixed so the
 * comparison across ages is apples-to-apples.
 */
export function findRetirementAgeForSuccess(
  inputs: SimulationInputs,
  targetSuccessRate: number,
  opts?: { runCount?: number },
): RetirementSolveResult | undefined {
  const runCount = opts?.runCount ?? 250
  const { currentAge, maxAge } = inputs.person

  const successAt = (age: number): number =>
    runMonteCarlo(withRetirementAge(inputs, age), runCount, inputs.seed).successRate

  // If the best case (retire as late as possible) still falls short, give up.
  if (successAt(maxAge) < targetSuccessRate) return undefined

  // Binary search for the smallest age in [currentAge, maxAge] meeting the target.
  let lo = currentAge
  let hi = maxAge
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (successAt(mid) >= targetSuccessRate) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }

  return { age: lo, successRate: successAt(lo) }
}
