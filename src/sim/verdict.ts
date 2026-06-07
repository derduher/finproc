/**
 * Verdict — the single-sentence lead that tells a user the answer before any
 * chart: when they can retire, on how much, and whether that clears their
 * target. Plus `inflatedSpend`, which makes "today's dollars" tangible by
 * projecting a spend level to a future age. Pure and unit-tested.
 */
import { formatMoneyAbbreviated as fmt } from '../math'
import type { OutcomeReads } from './outcome'

/** One-sentence plain-language read of the plan, derived from the outcome reads. */
export function buildVerdict(reads: OutcomeReads, retireAge: number): string {
  const lead = `You're on track to retire at ${retireAge} on about ${fmt(reads.sustainable)}/yr in today's dollars`
  if (reads.isOverSaver) {
    return `${lead} — comfortably above your ${fmt(reads.target)} target, with room to spend more or retire sooner.`
  }
  if (reads.overspendBy > 0) {
    return `${lead} — short of your ${fmt(reads.target)} target, so closing the gap means trimming spending or working a little longer.`
  }
  return `${lead} — right at your target.`
}

/** Compound a today's-dollar amount forward `years` at `annualInflation`. */
export function inflatedSpend(todayDollars: number, annualInflation: number, years: number): number {
  return todayDollars * (1 + annualInflation) ** Math.max(0, years)
}
