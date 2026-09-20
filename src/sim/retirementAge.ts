import type { SimulationInputs } from '../schema'

export interface RetirementAgeOptions {
  /**
   * Assume every account is reachable from the retirement age onward — the
   * Rule of 55 / 72(t) SEPP / Roth-conversion-ladder case. Only ever *unlocks*
   * an account (`min` with its own start age), never delays one.
   *
   * Solvers want this on. Without it, a plan whose money is locked until 59½
   * can "succeed" at an early retirement age without funding the intervening
   * years at all: `runSingleProjection` treats a withdrawal lockout as a silent
   * shortfall rather than depletion (see its depletion criterion), so the
   * unfunded years cost the run nothing. The engine still charges the 10%
   * early-distribution penalty on traditional draws before 59½, so the real
   * cost of reaching the money early shows up in the answer.
   *
   * The store's own retirement-age cascade leaves this off: that path edits the
   * user's actual account settings, and silently moving their withdrawal ages
   * would be a plan change, not an assumption.
   */
  earlyAccess?: boolean
}

/**
 * Return a copy of `inputs` with the person's retirement age set to `retirementAge`,
 * cascading the change onto every account:
 *   - contributions stop at the new retirement age (contributionEndAge)
 *   - taxable accounts begin drawing at the new retirement age (withdrawalStartAge)
 *
 * Tax-advantaged accounts (traditional/roth) keep their own withdrawalStartAge,
 * since those are typically pinned to IRS rules (e.g. 59½) rather than the plan's
 * retirement date — unless `opts.earlyAccess` is set.
 *
 * This is the single source of truth shared by the store's retirement-age cascade
 * and the "find a retirement age" solver.
 */
export function withRetirementAge(
  inputs: SimulationInputs,
  retirementAge: number,
  opts: RetirementAgeOptions = {},
): SimulationInputs {
  return {
    ...inputs,
    person: { ...inputs.person, retirementAge },
    accounts: inputs.accounts.map((a) => ({
      ...a,
      contributionEndAge: retirementAge,
      ...(opts.earlyAccess
        ? { withdrawalStartAge: Math.min(a.withdrawalStartAge, retirementAge) }
        : a.type === 'taxable'
          ? { withdrawalStartAge: retirementAge }
          : null),
    })),
  }
}
