/**
 * Outcome reads — the methodology-aligned framing that replaces a binary success
 * number (docs/methodology-review.md P0 #2). Turns a MonteCarloResult + the
 * sustainable-spend figure into the facts the v2 screens display: how much you
 * can sustain, whether you're over-saving, the surplus distribution, and the
 * magnitude/timing of any shortfall.
 *
 * Pure and unit-tested so the screens stay presentational.
 */
import type { MonteCarloResult } from './montecarlo'

export interface OutcomeReads {
  /** Spend sustainable at the target confidence (today's $/yr). */
  sustainable: number
  /** The user's current target spend (today's $/yr). */
  target: number
  /** How far under the sustainable level the target sits (0 if not under). */
  underspendBy: number
  /** How far over the sustainable level the target sits (0 if not over). */
  overspendBy: number
  /** True when the plan can afford more than the target — the over-saver case. */
  isOverSaver: boolean
  /** Fraction of runs that hold the target spend to maxAge. */
  holdRate: number
  /** Surplus ("if markets are kind") distribution — ending balance percentiles. */
  legacyP10: number
  legacyP50: number
  legacyP90: number
  /** Age the worst 1-in-10 runs run short (undefined if even they stay funded). */
  worstShortfallAge: number | undefined
  /** Age the worst 1-in-100 runs run short (undefined if even they stay funded). */
  rareShortfallAge: number | undefined
  /** Age the sustainable-spend figure starts applying (retirement). */
  retireAge: number
  maxAge: number
}

export function deriveOutcomeReads(args: {
  result: MonteCarloResult
  sustainable: number
  target: number
  maxAge: number
  retireAge: number
}): OutcomeReads {
  const { result, sustainable, target, maxAge, retireAge } = args
  const shortfallAt = (q: number): number | undefined =>
    result.shortfallByPercentile.find((s) => s.fraction === q)?.age

  return {
    sustainable,
    target,
    underspendBy: Math.max(0, sustainable - target),
    overspendBy: Math.max(0, target - sustainable),
    isOverSaver: sustainable > target,
    holdRate: result.successRate,
    legacyP10: result.p10EndBalance,
    legacyP50: result.p50EndBalance,
    legacyP90: result.p90EndBalance,
    worstShortfallAge: shortfallAt(0.1),
    rareShortfallAge: shortfallAt(0.01),
    retireAge,
    maxAge,
  }
}
