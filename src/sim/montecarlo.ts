import { runSingleProjection } from './projection'
import type { SampledRates, SpendAdjustment } from './projection'
import { aggregateCashflows } from './cashflow'
import { sampleAgeAtDeath, MORTALITY_MAX_AGE } from './mortality'
import { mulberry32, boxMullerNormal, p10p90ToMean, p10p90ToSigma, percentile } from '../math'
import type { SimulationInputs } from '../schema'

export interface MonteCarloYearlyResult {
  age: number
  p10: number
  p50: number
  p90: number
  /** Median total contributions + match across runs (nominal $) */
  contributionsMedian: number
  /** Median Social Security income across runs (nominal $) */
  socialSecurityMedian: number
  /** Median gross withdrawals across runs (nominal $) */
  withdrawalsMedian: number
}

/** One sampled run trajectory, for the individual-paths ("spaghetti") chart. */
export interface SamplePath {
  /** Total portfolio balance at each year-end (nominal $), aligned to yearlyResults ages. */
  balances: number[]
  /** Age the portfolio ran short, if it did. */
  depleteAge: number | undefined
  /** Ages where guardrails trimmed spending (empty for the flat policy). */
  cutYears: number[]
  /** Ages where guardrails raised spending (empty for the flat policy). */
  raiseYears: number[]
  /**
   * Per-year nominal stock return drawn for this run, aligned to `balances`.
   * Optional: only populated for sampled runs; absent on legacy cached results
   * and on hand-built test fixtures.
   */
  returns?: number[]
  /** Per-year inflation drawn for this run, aligned to `balances`. */
  inflation?: number[]
}

/** Depletion-timing read: the age by which the worst `fraction` of runs run short. */
export interface ShortfallPercentile {
  /** Worst fraction of outcomes, e.g. 0.10 = the worst 1-in-10. */
  fraction: number
  /** Age by which that worst fraction has run short; undefined if fewer than `fraction` of runs ever deplete. */
  age: number | undefined
}

export interface MonteCarloResult {
  /** Percentile bands + cashflow medians: one entry per year */
  yearlyResults: MonteCarloYearlyResult[]
  successRate: number
  /** Median ending balance across all runs */
  p50EndBalance: number
  /** 10th-percentile ending balance */
  p10EndBalance: number
  /** 90th-percentile ending balance — the "if markets are kind" surplus read */
  p90EndBalance: number
  /** Median depletion age across failing runs; undefined if all succeed */
  medianDepleteAge: number | undefined
  /** A sample of individual run trajectories (≤ sampleCount) for the paths chart */
  samplePaths: SamplePath[]
  /** Depletion timing at a few worst-case fractions (magnitude + timing risk read) */
  shortfallByPercentile: ShortfallPercentile[]
}

/** Worst-case fractions reported in `shortfallByPercentile`. */
const SHORTFALL_FRACTIONS = [0.01, 0.05, 0.1, 0.25, 0.5] as const

/**
 * Age by which the worst `q`-fraction of runs have run short. Non-depleting runs
 * count as "never" (∞); if fewer than `q` of all runs deplete, returns undefined
 * ("even the worst 1-in-1/q keep funded"). Nearest-rank, no interpolation (so an
 * ∞ never leaks into the value).
 */
export function shortfallAgeAtFraction(
  depleteAges: number[],
  runCount: number,
  q: number,
): number | undefined {
  if (runCount <= 0) return undefined
  const sorted = [...depleteAges].sort((a, b) => a - b)
  const idx = Math.min(runCount - 1, Math.floor(q * runCount))
  // Positions [0, depleteCount) hold finite depletion ages (earliest first);
  // [depleteCount, runCount) are implicitly ∞ (never depleted).
  return idx < sorted.length ? sorted[idx] : undefined
}

export type ProgressStage = 'parse' | 'sample' | 'project' | 'aggregate'

export interface ProgressEvent {
  stage: ProgressStage
  done: number
  total: number
}

export type ProgressCallback = (event: ProgressEvent) => void

/**
 * Run Monte Carlo simulation with `runCount` independent samples.
 *
 * Rates are sampled once per breakpoint segment per run using a seeded PRNG
 * derived from `baseSeed`. This guarantees reproducible results for the same seed.
 *
 * Per-segment sampling:
 *  - Segment 0 (initial): uses initialStockGrowth{Min,Max} / initialInflation{Min,Max}
 *  - Segment k (breakpoint k): uses breakpoints[k].stockGrowth{Min,Max} / inflationMin/Max
 */
export function runMonteCarlo(
  inputs: SimulationInputs,
  runCount: number = 1000,
  baseSeed: number = inputs.seed,
  onProgress?: ProgressCallback,
  sampleCount: number = 60,
): MonteCarloResult {
  onProgress?.({ stage: 'parse', done: 1, total: 1 })
  const rng = mulberry32(baseSeed)
  onProgress?.({ stage: 'sample', done: 1, total: 1 })

  const { person } = inputs
  // Longevity: 'fixed' ends every run at maxAge; 'stochastic' draws a per-run age
  // at death, so the horizon (and the success criterion) varies run to run. The
  // band/cashflow arrays are sized to the widest possible horizon and trimmed to
  // the longest run actually realized.
  const stochasticLongevity = (inputs.longevity ?? 'fixed') === 'stochastic'
  const maxHorizonAge = stochasticLongevity ? MORTALITY_MAX_AGE : person.maxAge
  const years = maxHorizonAge - person.currentAge

  // Precompute the return/inflation distribution for each rate segment, tagged
  // with the age it takes effect. Each simulated year draws from whichever
  // segment is active that year (see `activeSegment`).
  const segments = buildSegments(inputs)

  // Accumulators: for each year, collect all runs' total balances. Under
  // stochastic longevity a run contributes only up to its age at death, so later
  // years hold fewer runs (the surviving cohort).
  const balancesByYear: number[][] = Array.from({ length: years }, () => [])
  const endBalances: number[] = []
  let successCount = 0
  const depleteAges: number[] = []
  const perRunYears: import('./projection').YearEndState[][] = []
  // Guardrails adjustments, captured only for the sampled runs (for the chart).
  const sampleAdjustments: SpendAdjustment[][] = []
  // Per-year rate schedules for the sampled runs (for the path narrative).
  const sampleRates: SampledRates[][] = []
  const sampleSize = Math.min(sampleCount, runCount)

  // Emit ~one project event per 5% of runs (min 10, max 100).
  const projectInterval = Math.max(1, Math.floor(runCount / Math.min(100, Math.max(10, runCount / 20))))

  for (let run = 0; run < runCount; run++) {
    if (onProgress && (run % projectInterval === 0 || run === runCount - 1)) {
      onProgress({ stage: 'project', done: run, total: runCount })
    }
    // Stochastic longevity: draw this run's age at death and shorten the horizon
    // to it. A run "succeeds" if the portfolio lasts until death — so success is an
    // expectation over lifespans, not a verdict against one arbitrary maxAge.
    let runInputs = inputs
    let runYears = years
    if (stochasticLongevity) {
      const deathAge = sampleAgeAtDeath(person.currentAge, rng)
      runYears = deathAge - person.currentAge
      runInputs = { ...inputs, person: { ...person, maxAge: deathAge } }
    }

    // Build a per-year rate schedule with year-to-year serial correlation
    // (`buildRateSchedule`). Per-year draws restore sequence-of-returns risk; the
    // AR(1) persistence layer makes a crash year tend to be followed by another,
    // and keeps inflation regimes sticky — IID alone *understates* sequence risk.
    const yearlyRates = buildRateSchedule(segments, person.currentAge, runYears, rng)
    const result = runSingleProjection(runInputs, yearlyRates)

    if (result.succeeded) {
      successCount++
    } else if (result.depleteAge !== undefined) {
      depleteAges.push(result.depleteAge)
    }

    const endBalance = result.yearlyResults.at(-1)?.totalBalance ?? 0
    endBalances.push(endBalance)

    for (let y = 0; y < result.yearlyResults.length; y++) {
      balancesByYear[y].push(result.yearlyResults[y].totalBalance)
    }
    perRunYears.push(result.yearlyResults)
    if (run < sampleSize) {
      sampleAdjustments.push(result.spendAdjustments)
      sampleRates.push(yearlyRates)
    }
  }

  // Trim trailing years no run ever reached (under stochastic longevity the cohort
  // dies off before MORTALITY_MAX_AGE). Survival is monotone, so only the tail can
  // be empty — interior years always hold at least the runs that outlived them.
  while (balancesByYear.length > 0 && balancesByYear[balancesByYear.length - 1].length === 0) {
    balancesByYear.pop()
  }

  // Build yearly percentile bands + cashflow medians
  onProgress?.({ stage: 'aggregate', done: 0, total: 1 })
  const cashflows = aggregateCashflows(perRunYears)
  const yearlyResults: MonteCarloYearlyResult[] = balancesByYear.map((balances, y) => {
    const age = person.currentAge + y + 1
    return {
      age,
      p10: percentile(balances, 10),
      p50: percentile(balances, 50),
      p90: percentile(balances, 90),
      contributionsMedian: cashflows[y]?.contributionsMedian ?? 0,
      socialSecurityMedian: cashflows[y]?.socialSecurityMedian ?? 0,
      withdrawalsMedian: cashflows[y]?.withdrawalsMedian ?? 0,
    }
  })

  // Sample of individual trajectories for the paths chart. The runs are already
  // a seeded random sample, so the first `sampleCount` are a representative draw.
  const samplePaths: SamplePath[] = perRunYears
    .slice(0, sampleSize)
    .map((yrs, i) => {
      const adj = sampleAdjustments[i] ?? []
      const rates = (sampleRates[i] ?? []).slice(0, yrs.length)
      return {
        balances: yrs.map((y) => y.totalBalance),
        depleteAge: yrs.find((y) => y.totalBalance === 0)?.age,
        cutYears: adj.filter((a) => a.kind === 'cut').map((a) => a.age),
        raiseYears: adj.filter((a) => a.kind === 'raise').map((a) => a.age),
        returns: rates.map((r) => r.stockGrowth),
        inflation: rates.map((r) => r.inflation),
      }
    })

  const shortfallByPercentile: ShortfallPercentile[] = SHORTFALL_FRACTIONS.map((q) => ({
    fraction: q,
    age: shortfallAgeAtFraction(depleteAges, runCount, q),
  }))

  const result: MonteCarloResult = {
    yearlyResults,
    successRate: successCount / runCount,
    p50EndBalance: percentile(endBalances, 50),
    p10EndBalance: percentile(endBalances, 10),
    p90EndBalance: percentile(endBalances, 90),
    medianDepleteAge: depleteAges.length > 0 ? percentile(depleteAges, 50) : undefined,
    samplePaths,
    shortfallByPercentile,
  }
  onProgress?.({ stage: 'aggregate', done: 1, total: 1 })
  return result
}

/** A rate segment's distribution params plus the age from which it applies. */
export interface RateSegment {
  startAge: number
  growthMean: number
  growthSigma: number
  inflationMean: number
  inflationSigma: number
}

/** Lag-1 serial correlation applied to the standardized return / inflation shocks. */
export interface RatePersistence {
  /** Year-to-year autocorrelation of equity returns (multi-year bear/bull runs). */
  stock: number
  /** Year-to-year autocorrelation of inflation (empirically high). */
  inflation: number
}

/**
 * Default serial-correlation coefficients. The previous IID behavior is exactly
 * the `{ stock: 0, inflation: 0 }` special case.
 *
 * Equity returns get a modest positive coefficient: annual returns are close to a
 * random walk, but bear/bull markets persist across years, and pure IID lets a
 * crash year stand alone — *understating* sequence-of-returns risk. Inflation gets
 * a much larger coefficient: realized inflation is strongly persistent (high-
 * inflation regimes last years, e.g. the 1970s), which IID sampling erased. The
 * coefficients only reshape the *path*; each year's marginal distribution (the
 * user's P10/P90 spread) is preserved exactly.
 */
export const DEFAULT_PERSISTENCE: RatePersistence = { stock: 0.15, inflation: 0.65 }

/**
 * Default contemporaneous correlation between the equity-return and inflation
 * shocks (#9). Negative: high-inflation years historically depress nominal equity
 * returns (the 1970s), so the previous independent sampling understated the joint
 * "stagflation" risk where both move against the retiree at once. Like the
 * persistence coefficients it only reshapes the joint *path* — each stream's
 * marginal distribution (the user's P10/P90 spread) is preserved exactly. `0`
 * reproduces the prior independent draws.
 */
export const DEFAULT_RATE_CORRELATION = -0.35

/**
 * Build a per-year `SampledRates` schedule with AR(1) serial correlation and a
 * contemporaneous return↔inflation correlation.
 *
 * Each stream carries a standardized state `z` across years (and across segment
 * breakpoints): `zₜ = ρ·zₜ₋₁ + √(1−ρ²)·εₜ`, with `z₀ = ε₀`. The innovations
 * `εₜ` are drawn jointly so that `corr(εStock, εInfl) = correlation` (Cholesky:
 * `εInfl = c·εStock + √(1−c²)·η`). Each `εₜ` and `zₜ` stays marginally `N(0,1)`,
 * so converting by the active segment's `mean + sigma·z` preserves that segment's
 * distribution exactly — only the joint structure (autocorrelation across years +
 * cross-correlation within a year) changes. With `persistence = {0,0}` and
 * `correlation = 0` the schedule reduces to the plain independent per-year draws.
 *
 * Draw order (stock shock, then inflation shock, per year) matches the prior loop,
 * so `{0,0}` persistence with `0` correlation is bit-for-bit identical.
 */
export function buildRateSchedule(
  segments: RateSegment[],
  startAge: number,
  years: number,
  rng: () => number,
  persistence: RatePersistence = DEFAULT_PERSISTENCE,
  correlation: number = DEFAULT_RATE_CORRELATION,
): SampledRates[] {
  const schedule: SampledRates[] = new Array(years)
  const kStock = Math.sqrt(1 - persistence.stock ** 2)
  const kInfl = Math.sqrt(1 - persistence.inflation ** 2)
  const cInfl = Math.sqrt(1 - correlation ** 2)
  let zStock = 0
  let zInfl = 0
  for (let y = 0; y < years; y++) {
    // Jointly-distributed standard-normal innovations with corr = `correlation`.
    const eStock = boxMullerNormal(0, 1, rng)
    const eInfl = correlation * eStock + cInfl * boxMullerNormal(0, 1, rng)
    zStock = y === 0 ? eStock : persistence.stock * zStock + kStock * eStock
    zInfl = y === 0 ? eInfl : persistence.inflation * zInfl + kInfl * eInfl
    const seg = activeSegment(segments, startAge + y)
    schedule[y] = {
      stockGrowth: seg.growthMean + seg.growthSigma * zStock,
      inflation: seg.inflationMean + seg.inflationSigma * zInfl,
    }
  }
  return schedule
}

/**
 * Build the list of rate segments (initial + each breakpoint), sorted ascending
 * by the age they take effect. The initial segment applies from `currentAge`;
 * each breakpoint supersedes earlier ones from its `startAge` onward.
 */
export function buildSegments(inputs: SimulationInputs): RateSegment[] {
  const initial: RateSegment = {
    startAge: inputs.person.currentAge,
    growthMean: p10p90ToMean(inputs.initialStockGrowthMin, inputs.initialStockGrowthMax),
    growthSigma: p10p90ToSigma(inputs.initialStockGrowthMin, inputs.initialStockGrowthMax),
    inflationMean: p10p90ToMean(inputs.initialInflationMin, inputs.initialInflationMax),
    inflationSigma: p10p90ToSigma(inputs.initialInflationMin, inputs.initialInflationMax),
  }
  const breakpointSegments = inputs.breakpoints.map((bp) => ({
    startAge: bp.startAge,
    growthMean: p10p90ToMean(bp.stockGrowthMin, bp.stockGrowthMax),
    growthSigma: p10p90ToSigma(bp.stockGrowthMin, bp.stockGrowthMax),
    inflationMean: p10p90ToMean(bp.inflationMin, bp.inflationMax),
    inflationSigma: p10p90ToSigma(bp.inflationMin, bp.inflationMax),
  }))
  return [initial, ...breakpointSegments].sort((a, b) => a.startAge - b.startAge)
}

/** The segment active at `age`: the latest one whose `startAge ≤ age`. */
export function activeSegment(segments: RateSegment[], age: number): RateSegment {
  let active = segments[0]
  for (const s of segments) {
    if (s.startAge <= age) active = s
    else break
  }
  return active
}
