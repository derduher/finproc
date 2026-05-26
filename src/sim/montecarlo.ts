import { runSingleProjection } from './projection'
import { aggregateCashflows } from './cashflow'
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

export interface MonteCarloResult {
  /** Percentile bands + cashflow medians: one entry per year */
  yearlyResults: MonteCarloYearlyResult[]
  successRate: number
  /** Median ending balance across all runs */
  p50EndBalance: number
  /** 10th-percentile ending balance */
  p10EndBalance: number
  /** Median depletion age across failing runs; undefined if all succeed */
  medianDepleteAge: number | undefined
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
): MonteCarloResult {
  onProgress?.({ stage: 'parse', done: 1, total: 1 })
  const rng = mulberry32(baseSeed)
  onProgress?.({ stage: 'sample', done: 1, total: 1 })

  const {
    initialStockGrowthMin,
    initialStockGrowthMax,
    initialInflationMin,
    initialInflationMax,
    person,
  } = inputs

  const years = person.maxAge - person.currentAge

  // Accumulators: for each year, collect all runs' total balances
  const balancesByYear: number[][] = Array.from({ length: years }, () => [])
  const endBalances: number[] = []
  let successCount = 0
  const depleteAges: number[] = []
  const perRunYears: import('./projection').YearEndState[][] = []

  // Emit ~one project event per 5% of runs (min 10, max 100).
  const projectInterval = Math.max(1, Math.floor(runCount / Math.min(100, Math.max(10, runCount / 20))))

  for (let run = 0; run < runCount; run++) {
    if (onProgress && (run % projectInterval === 0 || run === runCount - 1)) {
      onProgress({ stage: 'project', done: run, total: runCount })
    }
    // Sample rates for the initial segment
    const initGrowthMean = p10p90ToMean(initialStockGrowthMin, initialStockGrowthMax)
    const initGrowthSigma = p10p90ToSigma(initialStockGrowthMin, initialStockGrowthMax)
    const initInflationMean = p10p90ToMean(initialInflationMin, initialInflationMax)
    const initInflationSigma = p10p90ToSigma(initialInflationMin, initialInflationMax)

    const sampledGrowth = boxMullerNormal(initGrowthMean, initGrowthSigma, rng)
    const sampledInflation = boxMullerNormal(initInflationMean, initInflationSigma, rng)

    // For breakpoint segments, sample rates but store for later use per-year
    // We pre-sample all breakpoint rates for this run before running the projection.
    // The projection.ts code currently uses the passed rates for ALL years (ignoring
    // breakpoints internally). For true per-segment MC, we run the projection
    // year-by-year here instead.
    //
    // Simple approach: run each segment separately and stitch results.
    const result = runSegmentedProjection(inputs, sampledGrowth, sampledInflation, rng)

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

  const result: MonteCarloResult = {
    yearlyResults,
    successRate: successCount / runCount,
    p50EndBalance: percentile(endBalances, 50),
    p10EndBalance: percentile(endBalances, 10),
    medianDepleteAge: depleteAges.length > 0 ? percentile(depleteAges, 50) : undefined,
  }
  onProgress?.({ stage: 'aggregate', done: 1, total: 1 })
  return result
}

/**
 * Run a single projection with per-segment rate sampling.
 * For each breakpoint segment, draws fresh rates from the PRNG.
 * The initial segment uses the pre-sampled rates passed in.
 */
function runSegmentedProjection(
  inputs: SimulationInputs,
  initialGrowth: number,
  initialInflation: number,
  rng: () => number,
): ReturnType<typeof runSingleProjection> {
  const { breakpoints } = inputs

  if (breakpoints.length === 0) {
    // No breakpoints: single segment
    return runSingleProjection(inputs, {
      stockGrowth: initialGrowth,
      inflation: initialInflation,
    })
  }

  // Multiple segments: each breakpoint re-samples rates.
  // We run the projection for each segment independently and splice results.
  // Approach: run the full projection but substitute the appropriate sampled rates
  // based on which year we're in. Since runSingleProjection doesn't support
  // per-year rate changes, we'll pass the initial segment rates and accept that
  // breakpoint-specific variance is only approximated.
  //
  // For a proper implementation, we'd need a per-year rate injection into the
  // projection loop. For now: sample all segment rates, use the initial segment
  // rates for runSingleProjection (which handles breakpoints internally via
  // re-using the passed rates). This is the spec-documented simplification:
  // "one MC draw per segment."
  //
  // Future improvement: extend runSingleProjection to accept per-segment rate maps.

  // Sample one (growth, inflation) draw per breakpoint segment for this run.
  // Order matters for PRNG determinism: each call to boxMullerNormal consumes
  // two draws from `rng`.
  const segRates = inputs.breakpoints.map((bp) => {
    const growthMean = p10p90ToMean(bp.stockGrowthMin, bp.stockGrowthMax)
    const growthSigma = p10p90ToSigma(bp.stockGrowthMin, bp.stockGrowthMax)
    const inflMean = p10p90ToMean(bp.inflationMin, bp.inflationMax)
    const inflSigma = p10p90ToSigma(bp.inflationMin, bp.inflationMax)
    return {
      stockGrowth: boxMullerNormal(growthMean, growthSigma, rng),
      inflation: boxMullerNormal(inflMean, inflSigma, rng),
    }
  })

  return runSingleProjection(
    inputs,
    { stockGrowth: initialGrowth, inflation: initialInflation },
    segRates,
  )
}
