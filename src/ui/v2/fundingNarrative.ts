/**
 * The sentence under the funding chart. Pure.
 *
 * Its job is to stop the crossing from being read as the retirement date. The
 * crossing pits a median projection against a confidence-matched requirement,
 * which is optimistic; `findRetirementAgeForSuccess` answers the real question.
 * When the two disagree, say so plainly rather than letting the reader pick.
 */
import { formatMoneyAbbreviated as fmt } from '../../math'
import { crossingAge, requiredAt } from '../../sim/fundingCurve'
import type { FundingCurveResult } from '../../sim/fundingCurve'

export interface FundingCaptionInput {
  curve: FundingCurveResult
  confidence: number
  /** The solver's confidence-matched earliest retirement age, if it found one. */
  earliestAge?: number
  /** The plan's own retirement age — where the gap is quoted when there's no crossing. */
  planRetirementAge: number
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

  if (cross === undefined) {
    // Quote the gap where the reader actually plans to stop working. If that's
    // past the solved window, quote the last age we have.
    const at =
      curve.points.find((p) => p.age === planRetirementAge) ?? curve.points[curve.points.length - 1]
    const needed = requiredAt(at, confidence)
    const short = needed - at.projected.p50
    return `At ${at.age} you're projected to have ${fmt(at.projected.p50)} against ${fmt(needed)} needed — ${fmt(short)} short. Spending less, saving more or working longer all close it.`
  }

  if (cross === curve.points[0].age) {
    return `You're already above the line: at ${pct}% confidence, today's savings cover this spending for the rest of the plan.`
  }

  if (earliestAge === undefined) {
    return `The lines cross at ${cross} on the median projection, so markets have to be about average for that to land.`
  }

  if (earliestAge === cross) {
    return `The lines cross at ${cross}, which matches the ${pct}% answer from the full simulation.`
  }

  return `The lines cross at ${cross}, but that pits a median projection against a ${pct}% requirement, so it flatters you. Running both together gives ${earliestAge}, marked on the chart.`
}
