/**
 * The sentence under the funding chart. Pure.
 *
 * Its job is to stop the crossing from being read as the retirement date. The
 * crossing pits a median projection against a confidence-matched requirement,
 * which is optimistic; `findRetirementAgeForSuccess` answers the real question.
 * When the two disagree, say so plainly rather than letting the reader pick.
 */
import { formatMoneyAbbreviated as fmt } from '../../math'
import { crossingAge, fullyFundedAge, requiredAt } from '../../sim/fundingCurve'
import type { FundingCurveResult } from '../../sim/fundingCurve'

export interface FundingCaptionInput {
  curve: FundingCurveResult
  confidence: number
  /** The solver's confidence-matched earliest retirement age, if it found one. */
  earliestAge?: number
  /** The plan's own retirement age — where the gap is quoted when there's no crossing. */
  planRetirementAge: number
}

export interface FundingHorizonInput {
  firstAge: number
  /** Oldest age the curve was solved for. */
  lastSolvedAge: number
  planMaxAge: number
  longevity: 'fixed' | 'stochastic'
}

/**
 * States the chart's horizon, so a curve that stops at 80 on a plan that runs
 * to 100 doesn't read as the plan ending there. Under a varying lifespan there
 * is no single end age to name — each run draws its own — so say that instead
 * of quoting `maxAge`, which the engine barely uses in that mode. Pure.
 */
export function fundingHorizonNote({
  firstAge,
  lastSolvedAge,
  planMaxAge,
  longevity,
}: FundingHorizonInput): string {
  const range = `Solved from ${firstAge} to ${lastSolvedAge}.`
  if (longevity === 'stochastic') {
    return `${range} Your lifespan varies run to run, so the plan has no single end date.`
  }
  if (lastSolvedAge >= planMaxAge - 1) return `${range} That's to the end of your plan.`
  return `${range} Your plan runs to ${planMaxAge}; retiring later than ${lastSolvedAge} isn't shown.`
}

export function fundingCaption({
  curve,
  confidence,
  earliestAge,
  planRetirementAge,
}: FundingCaptionInput): string {
  if (curve.points.length === 0) return ''
  const pct = Math.round(confidence * 100)
  const cross = crossingAge(curve, confidence, 'p50')
  // Rare, and worth saying out loud when it happens: guaranteed income covering
  // the whole spend is the one case where the requirement genuinely reaches zero.
  const funded = fullyFundedAge(curve, confidence)
  const fundedNote =
    funded !== undefined && funded > curve.points[0].age
      ? ` From ${funded} you'd need no portfolio at all — Social Security covers the spend.`
      : funded !== undefined
        ? ` You'd need no portfolio at all: Social Security already covers the spend.`
        : ''

  if (cross === undefined) {
    // Quote the gap where the reader actually plans to stop working. If that's
    // past the solved window, quote the last age we have.
    const at =
      curve.points.find((p) => p.age === planRetirementAge) ?? curve.points[curve.points.length - 1]
    const needed = requiredAt(at, confidence)
    const short = needed - at.projected.p50
    return `At ${at.age} you're projected to have ${fmt(at.projected.p50)} against ${fmt(needed)} needed — ${fmt(short)} short. Spending less, saving more or working longer all close it.${fundedNote}`
  }

  if (cross === curve.points[0].age) {
    return `You're already above the line: at ${pct}% confidence, today's savings cover this spending for the rest of the plan.${fundedNote}`
  }

  if (earliestAge === undefined) {
    return `The lines cross at ${cross} on the median projection, so markets have to be about average for that to land.${fundedNote}`
  }

  if (earliestAge === cross) {
    return `The lines cross at ${cross}, which matches the ${pct}% answer from the full simulation.${fundedNote}`
  }

  return `The lines cross at ${cross}, but that pits a median projection against a ${pct}% requirement, so it flatters you. Running both together gives ${earliestAge}, marked on the chart.${fundedNote}`
}
