/**
 * Historical stress testing — replay actual market history against the user's
 * plan instead of (or alongside) the random Monte Carlo draws.
 *
 * The Monte Carlo answers "how likely?"; this answers "could I survive *that*?"
 * by feeding `runSingleProjection` a deterministic, historically-derived rate
 * schedule. Two reads:
 *
 *  1. Named-crisis replay (`runHistoricalScenario`) — overlay a recognizable
 *     crisis (1929, 1973, 2000, 2008) anchored at retirement age, where
 *     sequence-of-returns risk bites hardest.
 *  2. Cohort backtest (`runCohortBacktest`) — replay *every* historical start
 *     year with full coverage of the retirement horizon and report the fraction
 *     that survived (the Trinity-study / cFIREsim approach).
 *
 * Data: approximate annual S&P-500 total returns (incl. dividends) and US CPI
 * inflation, NOMINAL, rounded to 0.1%. Sources: Aswath Damodaran's annual
 * returns dataset (NYU Stern) and BLS CPI. These are illustrative, not a precise
 * record — correct against primary sources if exact figures matter. The engine
 * consumes nominal stock growth and inflation as separate streams (see
 * `projection.ts`), so both must be paired per year for stagflation to read
 * correctly (e.g. the 1970s: positive nominal returns devoured by inflation).
 */
import { runSingleProjection, type SampledRates } from './projection'
import { buildSegments, activeSegment } from './montecarlo'
import type { SimulationInputs } from '../schema'

export interface HistoricalYear {
  year: number
  /** Nominal total return of US large-cap equities (0.21 = +21%). */
  stock: number
  /** Year-over-year CPI inflation (0.03 = +3%). */
  inflation: number
}

/**
 * Annual nominal S&P-500 total return + US CPI inflation, 1928–2023.
 * Rounded to 0.1%. See module header for provenance and caveats.
 */
export const HISTORICAL_SERIES: HistoricalYear[] = [
  { year: 1928, stock: 0.438, inflation: -0.012 },
  { year: 1929, stock: -0.083, inflation: 0.0 },
  { year: 1930, stock: -0.251, inflation: -0.027 },
  { year: 1931, stock: -0.438, inflation: -0.089 },
  { year: 1932, stock: -0.086, inflation: -0.103 },
  { year: 1933, stock: 0.5, inflation: -0.052 },
  { year: 1934, stock: -0.012, inflation: 0.035 },
  { year: 1935, stock: 0.467, inflation: 0.026 },
  { year: 1936, stock: 0.319, inflation: 0.01 },
  { year: 1937, stock: -0.353, inflation: 0.037 },
  { year: 1938, stock: 0.293, inflation: -0.02 },
  { year: 1939, stock: -0.011, inflation: -0.013 },
  { year: 1940, stock: -0.107, inflation: 0.007 },
  { year: 1941, stock: -0.128, inflation: 0.099 },
  { year: 1942, stock: 0.192, inflation: 0.09 },
  { year: 1943, stock: 0.251, inflation: 0.03 },
  { year: 1944, stock: 0.19, inflation: 0.023 },
  { year: 1945, stock: 0.358, inflation: 0.022 },
  { year: 1946, stock: -0.084, inflation: 0.181 },
  { year: 1947, stock: 0.052, inflation: 0.088 },
  { year: 1948, stock: 0.057, inflation: 0.03 },
  { year: 1949, stock: 0.183, inflation: -0.018 },
  { year: 1950, stock: 0.308, inflation: 0.058 },
  { year: 1951, stock: 0.24, inflation: 0.06 },
  { year: 1952, stock: 0.184, inflation: 0.008 },
  { year: 1953, stock: -0.01, inflation: 0.007 },
  { year: 1954, stock: 0.526, inflation: -0.007 },
  { year: 1955, stock: 0.316, inflation: 0.004 },
  { year: 1956, stock: 0.066, inflation: 0.029 },
  { year: 1957, stock: -0.108, inflation: 0.03 },
  { year: 1958, stock: 0.434, inflation: 0.018 },
  { year: 1959, stock: 0.12, inflation: 0.015 },
  { year: 1960, stock: 0.005, inflation: 0.014 },
  { year: 1961, stock: 0.269, inflation: 0.007 },
  { year: 1962, stock: -0.087, inflation: 0.013 },
  { year: 1963, stock: 0.228, inflation: 0.016 },
  { year: 1964, stock: 0.165, inflation: 0.01 },
  { year: 1965, stock: 0.125, inflation: 0.019 },
  { year: 1966, stock: -0.101, inflation: 0.035 },
  { year: 1967, stock: 0.24, inflation: 0.03 },
  { year: 1968, stock: 0.111, inflation: 0.047 },
  { year: 1969, stock: -0.085, inflation: 0.062 },
  { year: 1970, stock: 0.04, inflation: 0.056 },
  { year: 1971, stock: 0.143, inflation: 0.033 },
  { year: 1972, stock: 0.189, inflation: 0.034 },
  { year: 1973, stock: -0.147, inflation: 0.087 },
  { year: 1974, stock: -0.265, inflation: 0.123 },
  { year: 1975, stock: 0.372, inflation: 0.069 },
  { year: 1976, stock: 0.238, inflation: 0.049 },
  { year: 1977, stock: -0.072, inflation: 0.067 },
  { year: 1978, stock: 0.066, inflation: 0.09 },
  { year: 1979, stock: 0.184, inflation: 0.133 },
  { year: 1980, stock: 0.324, inflation: 0.125 },
  { year: 1981, stock: -0.049, inflation: 0.089 },
  { year: 1982, stock: 0.214, inflation: 0.038 },
  { year: 1983, stock: 0.225, inflation: 0.038 },
  { year: 1984, stock: 0.063, inflation: 0.04 },
  { year: 1985, stock: 0.322, inflation: 0.038 },
  { year: 1986, stock: 0.185, inflation: 0.011 },
  { year: 1987, stock: 0.052, inflation: 0.044 },
  { year: 1988, stock: 0.168, inflation: 0.044 },
  { year: 1989, stock: 0.315, inflation: 0.046 },
  { year: 1990, stock: -0.032, inflation: 0.061 },
  { year: 1991, stock: 0.305, inflation: 0.031 },
  { year: 1992, stock: 0.076, inflation: 0.029 },
  { year: 1993, stock: 0.101, inflation: 0.027 },
  { year: 1994, stock: 0.013, inflation: 0.027 },
  { year: 1995, stock: 0.376, inflation: 0.025 },
  { year: 1996, stock: 0.23, inflation: 0.033 },
  { year: 1997, stock: 0.334, inflation: 0.017 },
  { year: 1998, stock: 0.286, inflation: 0.016 },
  { year: 1999, stock: 0.21, inflation: 0.027 },
  { year: 2000, stock: -0.091, inflation: 0.034 },
  { year: 2001, stock: -0.119, inflation: 0.016 },
  { year: 2002, stock: -0.221, inflation: 0.024 },
  { year: 2003, stock: 0.287, inflation: 0.019 },
  { year: 2004, stock: 0.109, inflation: 0.033 },
  { year: 2005, stock: 0.049, inflation: 0.034 },
  { year: 2006, stock: 0.158, inflation: 0.025 },
  { year: 2007, stock: 0.055, inflation: 0.041 },
  { year: 2008, stock: -0.37, inflation: 0.001 },
  { year: 2009, stock: 0.265, inflation: 0.027 },
  { year: 2010, stock: 0.151, inflation: 0.015 },
  { year: 2011, stock: 0.021, inflation: 0.03 },
  { year: 2012, stock: 0.16, inflation: 0.017 },
  { year: 2013, stock: 0.324, inflation: 0.015 },
  { year: 2014, stock: 0.137, inflation: 0.008 },
  { year: 2015, stock: 0.014, inflation: 0.007 },
  { year: 2016, stock: 0.12, inflation: 0.021 },
  { year: 2017, stock: 0.218, inflation: 0.021 },
  { year: 2018, stock: -0.044, inflation: 0.019 },
  { year: 2019, stock: 0.315, inflation: 0.023 },
  { year: 2020, stock: 0.184, inflation: 0.014 },
  { year: 2021, stock: 0.287, inflation: 0.07 },
  { year: 2022, stock: -0.181, inflation: 0.065 },
  { year: 2023, stock: 0.263, inflation: 0.034 },
]

const FIRST_YEAR = HISTORICAL_SERIES[0].year
const LAST_YEAR = HISTORICAL_SERIES[HISTORICAL_SERIES.length - 1].year
const byYear = new Map(HISTORICAL_SERIES.map((r) => [r.year, r]))

/** A recognizable crisis the user can replay against their plan. */
export interface HistoricalScenario {
  id: string
  /** Display name, e.g. "Global Financial Crisis". */
  name: string
  /** First historical year of the crisis (anchored at retirement age). */
  startYear: number
  /** One-line plain-language description. */
  blurb: string
}

export const NAMED_SCENARIOS: HistoricalScenario[] = [
  {
    id: 'gd1929',
    name: 'Great Depression',
    startYear: 1929,
    blurb: 'A −83% equity drawdown over four years with deflation — the deepest stress on record.',
  },
  {
    id: 'stagflation1973',
    name: '1970s Stagflation',
    startYear: 1973,
    blurb: 'A −40% bear paired with double-digit inflation that quietly gutted purchasing power.',
  },
  {
    id: 'lostdecade2000',
    name: 'Lost Decade (Dot-com)',
    startYear: 2000,
    blurb: 'Three straight down years, then 2008 — a decade of roughly flat nominal returns.',
  },
  {
    id: 'gfc2008',
    name: 'Global Financial Crisis',
    startYear: 2008,
    blurb: 'A −37% single-year crash, then a sharp recovery — the classic sequence-risk test.',
  },
]

/**
 * Consecutive historical years starting at `startYear`, up to `n` of them.
 * Truncates at the end of the series rather than overrunning.
 */
export function historicalWindow(startYear: number, n: number): HistoricalYear[] {
  const out: HistoricalYear[] = []
  for (let y = startYear; y < startYear + n && y <= LAST_YEAR; y++) {
    const row = byYear.get(y)
    if (row) out.push(row)
  }
  return out
}

/**
 * Build a per-year rate schedule that replays history starting at `startYear`,
 * with the first historical year landing at `anchorAge`. Projection years before
 * the anchor use the plan's expected mean rates (no crisis — we isolate "what if
 * the crisis hits at retirement"). Years at/after the anchor replay consecutive
 * history; once history runs out, the tail falls back to the expected mean.
 */
export function buildHistoricalSchedule(args: {
  inputs: SimulationInputs
  startYear: number
  /** Age the crisis begins; defaults handled by the caller. */
  anchorAge: number
}): SampledRates[] {
  const { inputs, startYear, anchorAge } = args
  const { currentAge, maxAge } = inputs.person
  const years = maxAge - currentAge
  const segments = buildSegments(inputs)

  const schedule: SampledRates[] = new Array(years)
  for (let y = 0; y < years; y++) {
    const age = currentAge + y
    const offset = age - anchorAge
    const hist = offset >= 0 ? byYear.get(startYear + offset) : undefined
    if (hist) {
      schedule[y] = { stockGrowth: hist.stock, inflation: hist.inflation }
    } else {
      // Pre-crisis run-up or post-data tail: use the expected mean for this age.
      const seg = activeSegment(segments, age)
      schedule[y] = { stockGrowth: seg.growthMean, inflation: seg.inflationMean }
    }
  }
  return schedule
}

export interface HistoricalScenarioResult {
  scenario: HistoricalScenario
  /** Age the crisis was anchored at. */
  anchorAge: number
  /** Year-end nominal balance, aligned to ages currentAge+1 … maxAge. */
  balances: number[]
  /** Same balances deflated by the scenario's own realized inflation (today's $). */
  realBalances: number[]
  /** The rate schedule actually replayed (for hover / inspection). */
  rates: SampledRates[]
  survived: boolean
  /** Age the portfolio ran short, if it did. */
  depleteAge: number | undefined
  /** Lowest balance reached and the age it occurred (nominal). */
  troughBalance: number
  troughAge: number
  /** Ending nominal balance. */
  endBalance: number
}

/** Anchor age for a plan: retirement age, but never before the person's current age. */
function defaultAnchorAge(inputs: SimulationInputs, override?: number): number {
  if (override !== undefined) return override
  return Math.max(inputs.person.currentAge, inputs.person.retirementAge)
}

/**
 * Replay one named crisis against the plan and summarize survival, the trough,
 * and the ending balance.
 */
export function runHistoricalScenario(
  inputs: SimulationInputs,
  scenario: HistoricalScenario,
  opts?: { anchorAge?: number },
): HistoricalScenarioResult {
  const anchorAge = defaultAnchorAge(inputs, opts?.anchorAge)
  const rates = buildHistoricalSchedule({ inputs, startYear: scenario.startYear, anchorAge })
  const result = runSingleProjection(inputs, rates)
  const { currentAge } = inputs.person

  const balances = result.yearlyResults.map((r) => r.totalBalance)

  // Deflate by the scenario's OWN realized inflation, not the plan's expected
  // deflators — the crisis path has its own price level (deflation in 1929-32,
  // double-digit inflation in the 1970s). priceLevel after year i = ∏_{0..i}(1+infl).
  let cum = 1
  const realBalances = balances.map((b, i) => {
    cum *= 1 + (rates[i]?.inflation ?? 0)
    return b / cum
  })

  // Trough over the retirement phase only (age >= anchorAge): the crisis
  // drawdown, not the small pre-retirement accumulation balance.
  let troughBalance = Infinity
  let troughAge = anchorAge
  balances.forEach((b, i) => {
    const age = currentAge + i + 1
    if (age >= anchorAge && b < troughBalance) {
      troughBalance = b
      troughAge = age
    }
  })
  if (!Number.isFinite(troughBalance)) troughBalance = balances[balances.length - 1] ?? 0

  return {
    scenario,
    anchorAge,
    balances,
    realBalances,
    rates,
    survived: result.succeeded,
    depleteAge: result.depleteAge,
    troughBalance,
    troughAge,
    endBalance: balances[balances.length - 1] ?? 0,
  }
}

export interface CohortBacktest {
  /** Number of historical start years tested (full retirement-horizon coverage). */
  total: number
  /** How many survived to the plan's max age. */
  survived: number
  survivalRate: number
  /** Start years whose retirement would have run short (named for the headline). */
  failedYears: number[]
  /** Surviving start year that came closest to failing (lowest ending balance). */
  worstSurvivedYear: number | undefined
}

/**
 * Replay every historical start year that has full coverage of the retirement
 * horizon (anchorAge → maxAge) and report the survival rate. The pre-retirement
 * run-up uses expected rates in every cohort, so it doesn't bias the comparison;
 * only the retirement years vary by history — which is where sequence risk lives.
 */
export function runCohortBacktest(
  inputs: SimulationInputs,
  opts?: { anchorAge?: number },
): CohortBacktest {
  const anchorAge = defaultAnchorAge(inputs, opts?.anchorAge)
  const retirementYears = inputs.person.maxAge - anchorAge

  // A start year is eligible only if history fully covers the retirement horizon.
  const lastEligible = LAST_YEAR - Math.max(0, retirementYears - 1)
  let survived = 0
  let total = 0
  const failedYears: number[] = []
  let worstSurvivedYear: number | undefined
  let worstSurvivedEnd = Infinity

  for (let startYear = FIRST_YEAR; startYear <= lastEligible; startYear++) {
    total++
    const pseudo: HistoricalScenario = { id: `y${startYear}`, name: `${startYear}`, startYear, blurb: '' }
    const res = runHistoricalScenario(inputs, pseudo, { anchorAge })
    if (res.survived) {
      survived++
      if (res.endBalance < worstSurvivedEnd) {
        worstSurvivedEnd = res.endBalance
        worstSurvivedYear = startYear
      }
    } else {
      failedYears.push(startYear)
    }
  }

  return {
    total,
    survived,
    survivalRate: total > 0 ? survived / total : 1,
    failedYears,
    worstSurvivedYear,
  }
}
