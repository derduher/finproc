/**
 * Cashflow aggregation: turns per-run YearEndState[] into per-year medians
 * for contributions, social security, and withdrawals. Used by the Results
 * dashboard's HiCashflow chart.
 */
import { percentile } from '../math'
import type { YearEndState } from './projection'

export interface CashflowYear {
  age: number
  contributionsMedian: number
  socialSecurityMedian: number
  withdrawalsMedian: number
}

/**
 * @param runs  Each run's per-year states (`yearlyResults` from one run). Runs may
 *              have different lengths (under stochastic longevity each ends at its
 *              drawn age at death); year `y` aggregates only the runs that reached
 *              it, so the medians taper as the cohort dies off.
 */
export function aggregateCashflows(runs: YearEndState[][]): CashflowYear[] {
  if (runs.length === 0) return []
  const years = runs.reduce((m, r) => Math.max(m, r.length), 0)
  const out: CashflowYear[] = []
  for (let y = 0; y < years; y++) {
    const contribs: number[] = []
    const ss: number[] = []
    const wd: number[] = []
    let age = 0
    for (const run of runs) {
      if (y >= run.length) continue
      age = run[y].age
      contribs.push(run[y].contributions)
      ss.push(run[y].socialSecurity)
      wd.push(run[y].withdrawals)
    }
    out.push({
      age,
      contributionsMedian: percentile(contribs, 50),
      socialSecurityMedian: percentile(ss, 50),
      withdrawalsMedian: percentile(wd, 50),
    })
  }
  return out
}
