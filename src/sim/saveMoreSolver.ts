import { runMonteCarlo } from './montecarlo'
import type { SimulationInputs, Account } from '../schema'

export interface SaveMoreResult {
  /** Extra monthly contribution (today's $) needed to meet the target; 0 if already met. */
  extraMonthly: number
  /** Success rate achieved with that extra contribution. */
  successRate: number
}

const PERIODS_PER_YEAR = { weekly: 52, 'semi-monthly': 24, monthly: 12 } as const

/** Current contribution expressed as today's $/month (percent resolved at salary). */
function monthlyContribOf(a: Account, annualSalary: number): number {
  if (a.contributionType === 'percent') return (a.contributionAmount * annualSalary) / 12
  return (a.contributionAmount * PERIODS_PER_YEAR[a.contributionFrequency]) / 12
}

/**
 * Return `inputs` with `extraMonthly` added to the primary still-contributing
 * account (the first one whose contributions haven't ended). The account is
 * normalised to a flat monthly contribution preserving its current dollar
 * amount, so the model is well-defined whether it was flat or percent.
 */
export function withExtraMonthlyContribution(inputs: SimulationInputs, extraMonthly: number): SimulationInputs {
  if (inputs.accounts.length === 0) return inputs
  const { currentAge, annualSalary } = inputs.person
  const found = inputs.accounts.findIndex((a) => a.contributionEndAge > currentAge)
  const targetIdx = found >= 0 ? found : 0
  return {
    ...inputs,
    accounts: inputs.accounts.map((a, i) => {
      if (i !== targetIdx) return a
      const monthly = monthlyContribOf(a, annualSalary)
      return {
        ...a,
        contributionType: 'flat',
        contributionFrequency: 'monthly',
        contributionAmount: Math.max(0, monthly + extraMonthly),
      }
    }),
  }
}

/**
 * Find the smallest extra monthly contribution (today's $) that lifts the plan's
 * Monte Carlo success rate to `targetSuccessRate` — the actionable "to make your
 * plan work, save $X more / month" read (#10 family).
 *
 * Saving more never lowers the odds, so success is monotonically non-decreasing
 * in the extra amount: we grow an upper bound then bisect. The seed is fixed so
 * every candidate sees the same market draws (common random numbers).
 */
export function findRequiredExtraSavings(
  inputs: SimulationInputs,
  targetSuccessRate: number,
  opts?: { runCount?: number; tolerance?: number },
): SaveMoreResult {
  const runCount = opts?.runCount ?? 250
  const tolerance = opts?.tolerance ?? 25 // resolve to within $/mo

  const successAt = (m: number): number =>
    runMonteCarlo(withExtraMonthlyContribution(inputs, m), runCount, inputs.seed).successRate

  // Already there — nothing extra needed.
  if (successAt(0) >= targetSuccessRate) return { extraMonthly: 0, successRate: successAt(0) }

  // Grow the upper bound until the target is met (or we hit a sane ceiling).
  let lo = 0
  let hi = 500
  let guard = 0
  while (successAt(hi) < targetSuccessRate && guard++ < 20) hi *= 2
  // Even a very large extra can't reach the target — return that ceiling honestly.
  if (successAt(hi) < targetSuccessRate) return { extraMonthly: hi, successRate: successAt(hi) }

  // Bisect [lo, hi]: lo never meets the target, hi always does.
  while (hi - lo > tolerance) {
    const mid = (lo + hi) / 2
    if (successAt(mid) >= targetSuccessRate) hi = mid
    else lo = mid
  }

  return { extraMonthly: Math.ceil(hi), successRate: successAt(hi) }
}
