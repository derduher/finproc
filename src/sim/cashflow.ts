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
 * @param runs  Each run's per-year states (`yearlyResults` from one run).
 *              All runs are expected to have the same length and age sequence.
 */
export function aggregateCashflows(runs: YearEndState[][]): CashflowYear[] {
  if (runs.length === 0) return []
  const years = runs[0].length
  const out: CashflowYear[] = []
  for (let y = 0; y < years; y++) {
    const contribs: number[] = []
    const ss: number[] = []
    const wd: number[] = []
    for (const run of runs) {
      contribs.push(run[y].contributions)
      ss.push(run[y].socialSecurity)
      wd.push(run[y].withdrawals)
    }
    out.push({
      age: runs[0][y].age,
      contributionsMedian: percentile(contribs, 50),
      socialSecurityMedian: percentile(ss, 50),
      withdrawalsMedian: percentile(wd, 50),
    })
  }
  return out
}
