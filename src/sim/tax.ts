/**
 * Progressive federal income-tax model for the *withdrawal* phase.
 *
 * Replaces the old flat-marginal-rate gross-up with statutory brackets, a
 * standard deduction, partial Social Security taxation, and the 0/15/20% LTCG
 * schedule — all filing-status aware. Figures are 2025 federal law, expressed in
 * **today's dollars**; the projection deflates nominal flows by the realized
 * price level before calling in and re-inflates the results, so brackets track
 * inflation (a constant *real* spend stays in a constant real bracket).
 *
 * State income tax is out of scope (the prior model had none either).
 */

export type FilingStatus = 'single' | 'married'

/**
 * Combined employee FICA rate (6.2% Social Security + 1.45% Medicare), applied
 * to gross wages during working years. Simplifications: the SS wage-base cap
 * (~$176k, 2025) and the 0.9% additional Medicare tax are not modeled — slightly
 * conservative for high earners. 401(k) deferrals are FICA-taxable, so FICA is
 * charged on gross salary, not salary net of pre-tax contributions.
 */
export const FICA_RATE = 0.0765

/** A marginal bracket: `rate` applies to taxable income up to `upTo`. */
interface Bracket {
  upTo: number
  rate: number
}

/** 2025 standard deduction. */
export const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 15_000,
  married: 30_000,
}

/** 2025 ordinary-income brackets (on taxable income, i.e. after the deduction). */
const ORDINARY_BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { upTo: 11_925, rate: 0.1 },
    { upTo: 48_475, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_525, rate: 0.32 },
    { upTo: 626_350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  married: [
    { upTo: 23_850, rate: 0.1 },
    { upTo: 96_950, rate: 0.12 },
    { upTo: 206_700, rate: 0.22 },
    { upTo: 394_600, rate: 0.24 },
    { upTo: 501_050, rate: 0.32 },
    { upTo: 751_600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
}

/** 2025 long-term capital-gains breakpoints (on total taxable income). */
const LTCG_BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { upTo: 48_350, rate: 0 },
    { upTo: 533_400, rate: 0.15 },
    { upTo: Infinity, rate: 0.2 },
  ],
  married: [
    { upTo: 96_700, rate: 0 },
    { upTo: 600_050, rate: 0.15 },
    { upTo: Infinity, rate: 0.2 },
  ],
}

/** Social Security provisional-income thresholds (the 50% / 85% tier bases). */
const SS_BASES: Record<FilingStatus, { base1: number; base2: number }> = {
  single: { base1: 25_000, base2: 34_000 },
  married: { base1: 32_000, base2: 44_000 },
}

/** Total tax for `taxable` income (already net of any deduction) over `brackets`. */
function progressive(taxable: number, brackets: Bracket[]): number {
  if (taxable <= 0) return 0
  let tax = 0
  let prev = 0
  for (const b of brackets) {
    if (taxable <= prev) break
    tax += (Math.min(taxable, b.upTo) - prev) * b.rate
    prev = b.upTo
  }
  return tax
}

/** Federal ordinary-income tax on `grossOrdinary`, after the standard deduction. */
export function ordinaryTax(grossOrdinary: number, fs: FilingStatus): number {
  return progressive(Math.max(0, grossOrdinary - STANDARD_DEDUCTION[fs]), ORDINARY_BRACKETS[fs])
}

/**
 * Taxable portion of a Social Security benefit under the provisional-income rule.
 * `otherIncome` is all other income counted toward provisional income (ordinary
 * withdrawals + realized gains). Returns the dollars of SS added to ordinary
 * income (0–85% of the benefit).
 *
 * Unlike the brackets and standard deduction, the provisional-income bases are
 * fixed NOMINAL in law (unchanged since 1983/1993) — they shrink in real terms as
 * prices rise. All arguments here are in today's dollars, so the bases are
 * divided by `priceLevel` (cumulative inflation since the simulation start).
 */
export function taxableSocialSecurity(
  ssBenefit: number,
  otherIncome: number,
  fs: FilingStatus,
  priceLevel: number = 1,
): number {
  if (ssBenefit <= 0) return 0
  const base1 = SS_BASES[fs].base1 / priceLevel
  const base2 = SS_BASES[fs].base2 / priceLevel
  const provisional = otherIncome + 0.5 * ssBenefit
  if (provisional <= base1) return 0
  if (provisional <= base2) {
    return Math.min(0.5 * ssBenefit, 0.5 * (provisional - base1))
  }
  const lowerTier = Math.min(0.5 * ssBenefit, 0.5 * (base2 - base1))
  return Math.min(0.85 * ssBenefit, 0.85 * (provisional - base2) + lowerTier)
}

/**
 * LTCG tax on a `gain` that stacks on top of `incomeBelow` (total taxable income
 * sitting under the gain — ordinary taxable income plus any gains already
 * realized this year). Applies the 0/15/20% schedule across the stacked slice.
 */
export function ltcgTaxOnGain(gain: number, incomeBelow: number, fs: FilingStatus): number {
  if (gain <= 0) return 0
  const br = LTCG_BRACKETS[fs]
  const below = Math.max(0, incomeBelow)
  return progressive(below + gain, br) - progressive(below, br)
}

/**
 * Solve a monotonically-increasing net(gross) for the gross delivering `net`.
 * `gross = net*5 + 1` always over-delivers here: the top statutory marginal rate
 * is 37%, so even a worst-case slice taxed flat-out nets `5·net·(1−0.37) > net`.
 */
function bisectGross(net: number, netOf: (gross: number) => number): number {
  let lo = net
  let hi = net * 5 + 1
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (netOf(mid) < net) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Age before which traditional-account withdrawals incur the 10% additional tax
 * (integer-year proxy for the statutory 59½). Exceptions — rule of 55, SEPP/72(t),
 * hardship carve-outs — are not modeled, which is mildly conservative for early
 * retirees who would qualify.
 */
export const EARLY_WITHDRAWAL_AGE = 60

/** The 10% additional tax on early distributions. */
export const EARLY_WITHDRAWAL_PENALTY = 0.1

/**
 * Gross ordinary withdrawal needed to net `net` after tax, given `stacked`
 * ordinary income already realized this year (so the new dollars are taxed at the
 * correct marginal position, after the deduction is consumed). `penaltyRate`
 * adds a flat additional tax on the gross (the 10% early-distribution penalty).
 */
export function grossUpOrdinary(
  net: number,
  stacked: number,
  fs: FilingStatus,
  penaltyRate: number = 0,
): number {
  if (net <= 0) return 0
  const baseTax = ordinaryTax(stacked, fs)
  return bisectGross(
    net,
    (gross) => gross - (ordinaryTax(stacked + gross, fs) - baseTax) - penaltyRate * gross,
  )
}

/**
 * Gross taxable-account withdrawal needed to net `net` after LTCG tax, where a
 * fraction `gainFraction` of each gross dollar is a realized gain that stacks on
 * `incomeBelow` (ordinary taxable income + gains already realized this year).
 */
export function grossUpTaxableGain(
  net: number,
  gainFraction: number,
  incomeBelow: number,
  fs: FilingStatus,
): number {
  if (net <= 0) return 0
  if (gainFraction <= 0) return net
  return bisectGross(net, (gross) => gross - ltcgTaxOnGain(gross * gainFraction, incomeBelow, fs))
}
