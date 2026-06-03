/**
 * Deflation helpers — convert nominal Monte Carlo results to today's-dollar
 * values for the nominal/real display toggle. Pass-through when 'nominal'.
 */
import { cumulativeDeflator } from '../math'
import type { SimulationInputs } from '../schema'
import type { MonteCarloResult } from './montecarlo'

/**
 * Build the cumulative-deflator array for an inputs object. Combines the
 * initial segment (from `inputs.initialInflation*`) with user breakpoints.
 */
export function buildDeflators(inputs: SimulationInputs): number[] {
  const segments = [
    {
      startAge: inputs.person.currentAge,
      inflationMin: inputs.initialInflationMin,
      inflationMax: inputs.initialInflationMax,
    },
    ...inputs.breakpoints.map((b) => ({
      startAge: b.startAge,
      inflationMin: b.inflationMin,
      inflationMax: b.inflationMax,
    })),
  ]
  return cumulativeDeflator({
    currentAge: inputs.person.currentAge,
    maxAge: inputs.person.maxAge,
    segments,
  })
}

/**
 * Return a copy of `result` with monetary fields deflated to today's dollars.
 * No-op when displayMode is 'nominal' (returns the same reference).
 */
export function deflateResult(
  result: MonteCarloResult,
  displayMode: 'nominal' | 'real',
  inputs: SimulationInputs,
): MonteCarloResult {
  if (displayMode === 'nominal') return result
  const deflators = buildDeflators(inputs)
  const currentAge = inputs.person.currentAge
  const lastIdx = deflators.length - 1
  const factorAt = (age: number) => deflators[Math.max(0, Math.min(lastIdx, age - currentAge))]
  const endFactor = factorAt(inputs.person.maxAge)
  return {
    ...result,
    p50EndBalance: result.p50EndBalance * endFactor,
    p10EndBalance: result.p10EndBalance * endFactor,
    // Sample-path balances are per-year, aligned to yearlyResults ages. Shortfall
    // percentiles are ages (not dollars), so they pass through unchanged.
    // Guard against legacy cached results that predate these fields.
    p90EndBalance: result.p90EndBalance != null ? result.p90EndBalance * endFactor : result.p90EndBalance,
    samplePaths: (result.samplePaths ?? []).map((p) => ({
      ...p,
      balances: p.balances.map(
        (b, i) => b * factorAt(result.yearlyResults[i]?.age ?? currentAge + i + 1),
      ),
    })),
    yearlyResults: result.yearlyResults.map((r) => {
      const f = factorAt(r.age)
      return {
        ...r,
        p10: r.p10 * f,
        p50: r.p50 * f,
        p90: r.p90 * f,
        contributionsMedian: r.contributionsMedian * f,
        socialSecurityMedian: r.socialSecurityMedian * f,
        withdrawalsMedian: r.withdrawalsMedian * f,
      }
    }),
  }
}
