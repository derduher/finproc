// Pure math functions — no side effects, no I/O.
// All monetary values are plain JS numbers (float64).

// ─── Rate conversion ──────────────────────────────────────────────────────────

/** Convert an annual rate to an equivalent monthly rate using the standard formula. */
export function annualToMonthlyRate(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1
}

// ─── Inflation ────────────────────────────────────────────────────────────────

/**
 * Inflate (or deflate) an amount from one age-year to another.
 * Uses compound annual growth at `rate`.
 */
export function inflate(amount: number, fromAge: number, toAge: number, rate: number): number {
  return amount * Math.pow(1 + rate, toAge - fromAge)
}

/**
 * Cumulative deflator — for converting nominal future dollars back to today's
 * dollars. Returns an array indexed by `age - currentAge`, length
 * `maxAge - currentAge + 1`. Each element is 1 / cumulativeInflation through
 * that age, using the midpoint inflation `(min + max) / 2` of the active
 * segment for each year.
 *
 * Used by the nominal/real display toggle in ResultsStep / charts.
 */
export interface DeflatorSegment {
  startAge: number
  inflationMin: number
  inflationMax: number
}
export function cumulativeDeflator(args: {
  currentAge: number
  maxAge: number
  segments: DeflatorSegment[]
}): number[] {
  const { currentAge, maxAge, segments } = args
  // Sort defensively in case caller passes unsorted.
  const sorted = [...segments].sort((a, b) => a.startAge - b.startAge)
  const out: number[] = new Array(maxAge - currentAge + 1)
  out[0] = 1
  let cumulative = 1
  for (let age = currentAge + 1; age <= maxAge; age++) {
    // The inflation that applies for the year ending at `age` is the segment
    // whose startAge ≤ age — i.e., a breakpoint at startAge=35 takes effect
    // immediately for the year ending at age 35.
    let activeSeg = sorted[0]
    for (const s of sorted) {
      if (s.startAge <= age) activeSeg = s
      else break
    }
    const midpointInflation = (activeSeg.inflationMin + activeSeg.inflationMax) / 2
    cumulative *= 1 + midpointInflation
    out[age - currentAge] = 1 / cumulative
  }
  return out
}

// ─── PRNG — mulberry32 ────────────────────────────────────────────────────────

/**
 * Mulberry32 — fast, seedable PRNG returning values in [0, 1).
 * Same seed → bit-identical sequence.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return function () {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Normal distribution ──────────────────────────────────────────────────────

/**
 * Box-Muller transform: produce one normally-distributed sample.
 * Consumes two uniform values from `rng`.
 */
export function boxMullerNormal(mean: number, sigma: number, rng: () => number): number {
  // Avoid log(0) by clamping
  const u1 = Math.max(rng(), 1e-10)
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + sigma * z
}

/**
 * Derive σ for a normal distribution where P10 and P90 are known.
 * P10 ≈ mean - 1.2816σ, P90 ≈ mean + 1.2816σ → σ = (P90 - P10) / (2 × 1.2816)
 */
export function p10p90ToSigma(p10: number, p90: number): number {
  return (p90 - p10) / (2 * 1.2816)
}

/**
 * Derive the mean for a normal distribution where P10 and P90 are known.
 * mean = (P10 + P90) / 2
 */
export function p10p90ToMean(p10: number, p90: number): number {
  return (p10 + p90) / 2
}

// ─── Monte Carlo significance ─────────────────────────────────────────────────

/**
 * Is the difference between two Monte Carlo success rates large enough to be
 * distinguishable from sampling noise, rather than an artifact of running only
 * `n` trials?
 *
 * Treats each rate as a binomial proportion with standard error √(p(1−p)/n) and
 * requires |rateA − rateB| to exceed `z` standard errors of the difference
 * (default z = 1.96 ≈ 95% confidence). The two samples are treated as
 * independent, which is deliberately conservative: insights/sensitivity reuse the
 * same seed (common random numbers), so the true paired noise is smaller — a gate
 * that clears the independent bar is safely real. Prefer false negatives (don't
 * claim an effect) over false positives (claim noise as signal).
 */
export function monteCarloDeltaSignificant(
  rateA: number,
  rateB: number,
  n: number,
  z = 1.96,
): boolean {
  if (n <= 0) return false
  const seA = Math.sqrt((rateA * (1 - rateA)) / n)
  const seB = Math.sqrt((rateB * (1 - rateB)) / n)
  const seDiff = Math.sqrt(seA * seA + seB * seB)
  if (seDiff === 0) return Math.abs(rateA - rateB) > 0
  return Math.abs(rateA - rateB) > z * seDiff
}

// ─── Percentile ───────────────────────────────────────────────────────────────

/**
 * Return the p-th percentile (0–100) of an array of numbers.
 * Uses linear interpolation (same as numpy default).
 * Does NOT mutate the input array.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

// ─── RMD — IRS Uniform Lifetime Table ────────────────────────────────────────

/**
 * IRS Uniform Lifetime Table divisors (2022 update, Rev. Proc. 2022-32, Table III).
 * RMDs begin at age 73 per SECURE 2.0 Act.
 */
const RMD_TABLE: Record<number, number> = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9,
  78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5,
  83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4,
  88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8,
  93: 10.1, 94: 9.5,  95: 8.9,  96: 8.4,  97: 7.8,
  98: 7.3,  99: 6.8,  100: 6.4, 101: 6.0, 102: 5.6,
  103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1,
  108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3,
  113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7,
  118: 2.5, 119: 2.3, 120: 2.0,
}

/**
 * Return the IRS Uniform Lifetime Table divisor for a given age.
 * Returns `undefined` if the age is below 73 (no RMD required).
 * Returns 1.0 for ages beyond the table (conservative floor).
 */
export function rmdDivisor(age: number): number | undefined {
  if (age < 73) return undefined
  return RMD_TABLE[age] ?? 1.0
}

// ─── Tax gross-ups ────────────────────────────────────────────────────────────

/**
 * Calculate the gross withdrawal from a taxable account needed to net `netNeeded` after LTCG tax.
 * Gain fraction = (balance - basis) / balance.
 * Tax = gross × gainFraction × ltcgRate.
 * Solve: gross - gross × gainFraction × ltcgRate = netNeeded
 *      → gross = netNeeded / (1 - gainFraction × ltcgRate)
 */
export function taxableWithdrawalGrossUp(
  netNeeded: number,
  balance: number,
  basis: number,
  ltcgRate: number,
): number {
  if (balance <= 0) return netNeeded
  const gainFraction = Math.max(0, (balance - basis) / balance)
  const effectiveRate = gainFraction * ltcgRate
  if (effectiveRate >= 1) return netNeeded // degenerate — shouldn't happen
  return netNeeded / (1 - effectiveRate)
}

/**
 * Calculate the gross withdrawal from a traditional account needed to net `netNeeded` after income tax.
 * gross × (1 - marginalRate) = netNeeded → gross = netNeeded / (1 - marginalRate)
 */
export function traditionalWithdrawalGrossUp(netNeeded: number, marginalRate: number): number {
  if (marginalRate >= 1) return netNeeded
  return netNeeded / (1 - marginalRate)
}

// ─── Money formatting ─────────────────────────────────────────────────────────

/**
 * Format a dollar amount with abbreviated suffixes (K / M / B).
 * - < $1,000      → "$X" (no decimals)
 * - < $1,000,000  → "$X.XK" (one decimal)
 * - < $1,000,000,000 → "$X.XM" (one decimal)
 * - ≥ $1,000,000,000  → "$X.XB" (one decimal)
 */
export function formatMoneyAbbreviated(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`
  return `$${Math.round(value)}`
}
