/**
 * Display-mode projection of historical stress results. Kept pure (separate from
 * the hook) so the nominal→real mapping is unit-tested without rendering.
 *
 * A scenario carries both nominal `balances` and `realBalances` (deflated by the
 * crisis's OWN realized inflation). This picks the right series for the active
 * display mode and recomputes the trough/end against it, so the cards and the
 * chart overlay always agree with the dollar toggle.
 */
import type { HistoricalScenarioResult } from './historical'

export interface StressScenarioView {
  scenario: HistoricalScenarioResult['scenario']
  anchorAge: number
  /** Year-end balances in the active display mode, aligned to ages currentAge+1 … */
  balances: number[]
  survived: boolean
  depleteAge: number | undefined
  /** Lowest balance reached (display mode) and the age it occurred. */
  troughBalance: number
  troughAge: number
  /** Ending balance (display mode). */
  endBalance: number
}

export function toScenarioView(
  res: HistoricalScenarioResult,
  displayMode: 'nominal' | 'real',
  currentAge: number,
): StressScenarioView {
  const balances = displayMode === 'real' ? res.realBalances : res.balances

  // The trough that matters is the retirement-phase drawdown, not the small
  // early-accumulation balance — so only scan ages at/after the crisis anchor.
  // (Otherwise every scenario reports the same pre-retirement starting balance.)
  let troughBalance = Infinity
  let troughAge = res.anchorAge
  balances.forEach((b, i) => {
    const age = currentAge + i + 1
    if (age >= res.anchorAge && b < troughBalance) {
      troughBalance = b
      troughAge = age
    }
  })
  if (!Number.isFinite(troughBalance)) troughBalance = balances[balances.length - 1] ?? 0

  return {
    scenario: res.scenario,
    anchorAge: res.anchorAge,
    balances,
    survived: res.survived,
    depleteAge: res.depleteAge,
    troughBalance,
    troughAge,
    endBalance: balances[balances.length - 1] ?? 0,
  }
}
