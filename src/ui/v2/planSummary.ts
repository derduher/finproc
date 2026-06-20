/**
 * planSummary — small pure helpers that derive headline figures from a plan, for
 * the live screen's read-only summaries (saved total, annual additions). These
 * are the only surviving pieces of the old CoreLevers component; the live screen
 * edits the plan through the ResultExplorer chips, not an inline lever panel.
 */
import { irsContributionLimit } from '../../sim/irsLimits'
import type { SimulationInputs } from '../../schema'

const FREQ: Record<SimulationInputs['accounts'][number]['contributionFrequency'], number> = {
  weekly: 52 / 12,
  'semi-monthly': 2,
  monthly: 1,
}

/** Total starting balance across accounts. */
export function totalSaved(inputs: SimulationInputs): number {
  return inputs.accounts.reduce((s, a) => s + a.balance, 0)
}

/** Approximate annual employee additions (excludes employer match), for display. */
export function annualAdditions(inputs: SimulationInputs): number {
  const salary = inputs.person.annualSalary
  let total = 0
  for (const a of inputs.accounts) {
    if (a.contributeMax) {
      const limit = irsContributionLimit(a.accountSubtype)
      if (limit > 0) {
        total += limit
        continue
      }
    }
    const monthly =
      a.contributionType === 'percent'
        ? (a.contributionAmount * salary) / 12
        : a.contributionAmount * FREQ[a.contributionFrequency]
    total += monthly * 12
  }
  return total
}
