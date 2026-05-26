/**
 * Insights — rule-based interpretation of a Monte Carlo result.
 *
 * Each rule inspects (Inputs, Result) and either returns a card payload or
 * returns null to skip. The Results dashboard renders the non-null insights
 * as a row of {tone, title, body, cta} cards.
 *
 * Some rules run additional Monte Carlo passes (e.g. with a swapped strategy
 * or bumped retirement age) — these use a small `runCount` for speed.
 */
import { runMonteCarlo } from './montecarlo'
import { WithdrawalStrategy } from '../schema'
import type { SimulationInputs } from '../schema'
import type { MonteCarloResult } from './montecarlo'

export type InsightTone = 'good' | 'warn' | 'accent'

export interface Insight {
  tone: InsightTone
  title: string
  body: string
  cta: string
}

export interface InsightOptions {
  /** MC runs per rule that needs a re-projection (default 100). */
  runCount?: number
}

type Rule = (
  inputs: SimulationInputs,
  baseline: MonteCarloResult,
  runCount: number,
) => Insight | null

function effectiveRetireAge(inputs: SimulationInputs): number {
  if (inputs.accounts.length === 0) return inputs.person.currentAge
  return Math.max(...inputs.accounts.map((a) => a.contributionEndAge))
}

const taxOptimalRule: Rule = (inputs, baseline, runCount) => {
  if (inputs.withdrawalStrategy !== WithdrawalStrategy.TaxOptimal) return null
  const alt = runMonteCarlo(
    { ...inputs, withdrawalStrategy: WithdrawalStrategy.Proportional },
    runCount,
    inputs.seed,
  )
  const deltaPct = Math.round((baseline.successRate - alt.successRate) * 100)
  if (deltaPct < 2) return null
  return {
    tone: 'good',
    title: 'Tax-optimal strategy is paying off',
    body: `Versus a proportional draw, tax-optimal lifts success by ${deltaPct} percentage point${deltaPct === 1 ? '' : 's'} across 1,000 runs.`,
    cta: 'See strategy',
  }
}

const healthcareGapRule: Rule = (inputs) => {
  const retire = effectiveRetireAge(inputs)
  if (inputs.person.currentAge >= 65) return null
  if (retire < 55 || retire >= 65) return null
  const years = 65 - retire
  return {
    tone: 'warn',
    title: `Healthcare gap (${retire} → 65)`,
    body: `ACA premiums aren't modeled. ${years} year${years === 1 ? '' : 's'} of pre-Medicare costs could shift P10 meaningfully — consider adding to expenses.`,
    cta: 'Add expense',
  }
}

const retireOneYearLaterRule: Rule = (inputs, baseline, runCount) => {
  if (baseline.successRate >= 0.995) return null
  if (inputs.accounts.length === 0) return null
  const bumped = {
    ...inputs,
    accounts: inputs.accounts.map((a) => ({
      ...a,
      contributionEndAge: Math.min(a.contributionEndAge + 1, inputs.person.maxAge - 1),
    })),
  }
  const alt = runMonteCarlo(bumped, runCount, inputs.seed)
  const deltaPct = Math.round((alt.successRate - baseline.successRate) * 100)
  if (deltaPct < 2) return null
  const baselinePct = Math.round(baseline.successRate * 100)
  const altPct = Math.round(alt.successRate * 100)
  return {
    tone: 'accent',
    title: 'One more year of work matters',
    body: `Working one more year raises success rate from ${baselinePct}% → ${altPct}%. Try it as a scenario.`,
    cta: 'Branch scenario',
  }
}

const RULES: Rule[] = [taxOptimalRule, healthcareGapRule, retireOneYearLaterRule]

export function computeInsights(
  inputs: SimulationInputs,
  baseline: MonteCarloResult,
  opts: InsightOptions = {},
): Insight[] {
  const runCount = opts.runCount ?? 100
  return RULES.map((rule) => rule(inputs, baseline, runCount)).filter(
    (i): i is Insight => i !== null,
  )
}
