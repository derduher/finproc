/**
 * The three first-run "guesses" — defaults that only the user can firm up, and
 * that materially move the sustainable-spend answer: Social Security, employer
 * match, and account mix. Until they're checked, the result is honestly shown as
 * a RANGE (see `RangeHero` / `useGuessRange`).
 *
 * Each perturbation pushes one guess to a plausible alternative so the solver can
 * measure how much that single unknown moves the answer — the "swing". The band's
 * half-width is the root-sum-square of the unchecked swings (independent unknowns),
 * so confirming a guess drops its term and the range narrows; confirm all three
 * and it collapses to a single number.
 *
 * Pure and side-effect-free: every function returns a fresh `SimulationInputs`.
 */
import type { SimulationInputs } from '../schema'
import type { GuessId } from '../store'

/** How far the SS benefit is pushed down to gauge its swing (a plausible low read). */
const SS_LOW_FACTOR = 0.75
/** Fraction of tax-advantaged balance reallocated to taxable in the mix perturbation. */
const MIX_SHIFT = 0.5

/** Plausible-low Social Security: a lighter benefit, same claim age. */
export function lowerSocialSecurity(inputs: SimulationInputs): SimulationInputs {
  if (!inputs.socialSecurity) return inputs
  return {
    ...inputs,
    socialSecurity: {
      ...inputs.socialSecurity,
      annualAmountPresentDollars: Math.round(inputs.socialSecurity.annualAmountPresentDollars * SS_LOW_FACTOR),
    },
  }
}

/** No employer match — the floor if the guessed match doesn't exist. */
export function dropEmployerMatch(inputs: SimulationInputs): SimulationInputs {
  if (!inputs.accounts.some((a) => a.employerMatch)) return inputs
  return {
    ...inputs,
    accounts: inputs.accounts.map((a) => (a.employerMatch ? { ...a, employerMatch: undefined } : a)),
  }
}

/**
 * A more taxable-heavy mix than guessed: move half of each tax-advantaged balance
 * into a taxable sleeve, changing the tax treatment of withdrawals. The total
 * balance is preserved, so this isolates the *mix* unknown, not the amount saved.
 */
export function taxableHeavyMix(inputs: SimulationInputs): SimulationInputs {
  let shifted = 0
  const accounts = inputs.accounts.map((a) => {
    if (a.type === 'traditional' || a.type === 'roth') {
      const move = a.balance * MIX_SHIFT
      shifted += move
      return { ...a, balance: a.balance - move }
    }
    return a
  })
  if (shifted <= 0) return inputs
  const retireAge = inputs.person.retirementAge
  accounts.push({
    id: 'mix-perturb-taxable',
    name: 'Taxable (mix perturbation)',
    type: 'taxable',
    balance: shifted,
    costBasis: shifted,
    contributionAmount: 0,
    contributionType: 'flat',
    contributionFrequency: 'monthly',
    contributionEndAge: retireAge,
    withdrawalStartAge: retireAge,
  })
  return { ...inputs, accounts }
}

/** Perturbation per guess id — the single source the range hook iterates over. */
export const GUESS_PERTURBATIONS: Record<GuessId, (inputs: SimulationInputs) => SimulationInputs> = {
  ss: lowerSocialSecurity,
  match: dropEmployerMatch,
  mix: taxableHeavyMix,
}

/** Root-sum-square of independent swings (nullish entries ignored). */
export function combineSwings(swings: Array<number | null | undefined>): number {
  const sumSq = swings.reduce<number>((s, v) => (v == null ? s : s + v * v), 0)
  return Math.sqrt(sumSq)
}

/** Symmetric band around `best` by the combined swing, with the low end clamped at 0. */
export function guessRangeBand(best: number, swings: Array<number | null | undefined>): { low: number; high: number } {
  const half = combineSwings(swings)
  return { low: Math.max(0, best - half), high: best + half }
}
