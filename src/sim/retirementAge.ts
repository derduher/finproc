import type { SimulationInputs } from '../schema'

/**
 * Return a copy of `inputs` with the person's retirement age set to `retirementAge`,
 * cascading the change onto every account:
 *   - contributions stop at the new retirement age (contributionEndAge)
 *   - taxable accounts begin drawing at the new retirement age (withdrawalStartAge)
 *
 * Tax-advantaged accounts (traditional/roth) keep their own withdrawalStartAge,
 * since those are typically pinned to IRS rules (e.g. 59½) rather than the plan's
 * retirement date.
 *
 * This is the single source of truth shared by the store's retirement-age cascade
 * and the "find a retirement age" solver.
 */
export function withRetirementAge(inputs: SimulationInputs, retirementAge: number): SimulationInputs {
  return {
    ...inputs,
    person: { ...inputs.person, retirementAge },
    accounts: inputs.accounts.map((a) => ({
      ...a,
      contributionEndAge: retirementAge,
      ...(a.type === 'taxable' ? { withdrawalStartAge: retirementAge } : null),
    })),
  }
}
