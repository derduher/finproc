/**
 * Path narrative — turns one sampled trajectory's per-year drivers (returns,
 * inflation, withdrawals-as-guardrail-cuts, depletion) into a plain-language
 * story. The point is to answer "what actually happened year after year on this
 * path?" — especially to name sequence-of-returns risk, which a balance line
 * alone can't explain.
 *
 * Pure and unit-tested so the UI stays presentational.
 */
import type { SamplePath } from './montecarlo'

export interface PathNarrative {
  /** One-line plain-language read of the path. */
  summary: string
  /** Supporting detail: sequence risk, worst year, recovery, guardrail cuts. */
  points: string[]
  /** Mean annual nominal return over the path (0 when no rate data). */
  avgReturn: number
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)

/** First N retirement years considered for sequence-of-returns risk. */
const EARLY_WINDOW = 5
/** How far below the full-horizon average the early window must run to flag it. */
const SEQUENCE_GAP = 0.02

export function buildPathNarrative(args: {
  path: SamplePath
  currentAge: number
  retireAge: number
}): PathNarrative {
  const { path, currentAge, retireAge } = args
  const returns = path.returns ?? []

  if (returns.length === 0) {
    return { summary: 'Not enough detail to narrate this path.', points: [], avgReturn: 0 }
  }

  // balances[i] is year-end at age currentAge+i+1; returns[i] is that year's draw.
  const ageAt = (i: number) => currentAge + i + 1
  const avgReturn = mean(returns)

  // Early-retirement window (the years sequence risk hits hardest).
  const earlyReturns = returns.filter((_, i) => ageAt(i) >= retireAge && ageAt(i) < retireAge + EARLY_WINDOW)
  const earlyAvg = mean(earlyReturns)
  const sequenceRisk = earlyReturns.length > 0 && earlyAvg < avgReturn - SEQUENCE_GAP

  // Worst single year.
  let worstIdx = 0
  for (let i = 1; i < returns.length; i++) if (returns[i] < returns[worstIdx]) worstIdx = i
  const worst = returns[worstIdx]

  const points: string[] = []

  if (sequenceRisk) {
    const n = earlyReturns.length
    points.push(
      `Your first ${n} retirement year${n === 1 ? '' : 's'} (age ${retireAge}–${retireAge + n - 1}) averaged ${pct(earlyAvg)}, below the ${pct(avgReturn)} full-horizon average — early losses bite hardest because you're withdrawing at the same time.`,
    )
  }

  points.push(`Worst single year: ${pct(worst)} at age ${ageAt(worstIdx)}.`)

  const after = returns.slice(worstIdx + 1)
  if (worst < 0 && after.length > 0 && mean(after) > avgReturn) {
    points.push("Markets recovered afterward, but withdrawals taken during the dip never get those dollars back.")
  }

  const cuts = path.cutYears.length
  if (cuts > 0) {
    points.push(`Spending was trimmed in ${cuts} year${cuts === 1 ? '' : 's'} to keep the plan on track.`)
  }

  let summary: string
  if (path.depleteAge !== undefined) {
    summary = `This path runs short at age ${path.depleteAge}.`
  } else if (sequenceRisk) {
    summary = 'This plan survives, but a weak first few years of retirement do most of the damage.'
  } else {
    summary = `A relatively steady ride — markets averaged ${pct(avgReturn)} a year with no early shock.`
  }

  return { summary, points, avgReturn }
}
