/**
 * Funding curve — "what you need at each age" against "what you'll have".
 *
 * Two series over the same age axis, both in **today's dollars**:
 *
 *  - **Required**: for each age X, the portfolio balance you'd need *at* X so
 *    that retiring at X and spending `inputs.annualExpenses` from X to the end
 *    of the plan holds at a given confidence.
 *  - **Projected**: what you'd have at X if you kept working and contributing
 *    until X — the matching counterfactual, so the two curves answer the same
 *    question and their crossing means something.
 *
 * ### Why the requirement is solved per run, not per confidence
 *
 * A run survives starting balance B if and only if B is at least that run's own
 * minimum — survival is monotone in the balance you start with (verified
 * empirically across the tax gross-up, RMD and guardrails machinery). So
 * "the balance at which c of the runs survive" is exactly "the c-quantile of the
 * per-run minima". We bisect each run's minimum once and read any confidence off
 * the sorted list afterwards. That makes the confidence lever free, and removes
 * Monte Carlo noise from the confidence dimension entirely — two confidences
 * read from one sample can't cross, where two independent solves could.
 *
 * ### What the crossing does and doesn't mean
 *
 * Crossing the *median* projection against a 90% requirement factorizes a joint
 * probability, so it reads optimistic: it is not the same question as "in what
 * fraction of futures does retiring at X work", which is what
 * `findRetirementAgeForSuccess` answers. The chart draws the p10–p90 band so the
 * crossing reads as a range, and marks the solver's age separately. Don't
 * present the crossing as a confidence-matched retirement date.
 */
import { buildRateSchedule, buildSegments } from './montecarlo'
import { runSingleProjection } from './projection'
import { withRetirementAge } from './retirementAge'
import { sampleAgeAtDeath } from './mortality'
import { mulberry32, percentile } from '../math'
import type { SampledRates } from './projection'
import type { Account, SimulationInputs } from '../schema'

/** Oldest age worth asking "what would I need to retire here?" about. */
export const MAX_SOLVE_AGE = 80

/** Confidence levels drawn as faint reference lines beside the active one. */
export const FUNDING_GHOST_CONFIDENCES = [0.8, 0.95] as const

const DEFAULT_RUN_COUNT = 200
/** Resolve each run's minimum to within this many dollars. */
const DEFAULT_TOLERANCE = 2_000
/** Upper bracket for the bisection, doubled until it survives. */
const INITIAL_CEILING = 2_000_000
/** Give up doubling the ceiling after this many steps (~$2 × 10^12). */
const MAX_CEILING_DOUBLINGS = 20

export interface FundingProgress {
  done: number
  total: number
}

export interface ProjectedBand {
  p10: number
  p50: number
  p90: number
}

export interface FundingCurvePoint {
  age: number
  /**
   * Each run's minimum balance required to retire at this age, ascending
   * (today's dollars). Read a confidence level with {@link requiredAt}; the
   * whole array is kept so the confidence lever needs no re-solve.
   */
  requiredSorted: number[]
  /** Balance at this age if you work until it, across runs (today's dollars). */
  projected: ProjectedBand
}

export interface FundingCurveResult {
  points: FundingCurvePoint[]
  runCount: number
  /** The plan's own retirement age, for the chart's reference mark. */
  retirementAge: number
}

export interface FundingCurveOptions {
  runCount?: number
  /** Oldest age to solve; clamped to {@link MAX_SOLVE_AGE} and the plan's end. */
  maxSolveAge?: number
  tolerance?: number
  onProgress?: (event: FundingProgress) => void
}

/**
 * The balance needed at this age to clear `confidence` of the sampled futures.
 * Nearest-rank on the sorted per-run minima — no interpolation, so the value is
 * always one an actual run required. Pure; clamps rather than reading off the end.
 */
export function requiredAt(
  point: Pick<FundingCurvePoint, 'requiredSorted'>,
  confidence: number,
): number {
  const n = point.requiredSorted.length
  if (n === 0) return 0
  const c = Math.min(1, Math.max(0, confidence))
  return point.requiredSorted[Math.min(n - 1, Math.max(0, Math.round(c * (n - 1))))]
}

/**
 * First age at which the chosen projected series clears the requirement, or
 * undefined if it never does within the solved range. Pure.
 */
export function crossingAge(
  result: FundingCurveResult,
  confidence: number,
  series: keyof ProjectedBand,
): number | undefined {
  for (const p of result.points) {
    if (p.projected[series] >= requiredAt(p, confidence)) return p.age
  }
  return undefined
}

/**
 * The span of ages over which the projection crosses the requirement: earliest
 * on the optimistic band, latest on the pessimistic one. This is the honest
 * shape of the answer — the median's single crossing is one draw through a
 * range this wide. Either end is undefined when that band never crosses. Pure.
 */
export function crossingBand(
  result: FundingCurveResult,
  confidence: number,
): { from: number | undefined; to: number | undefined } {
  return {
    from: crossingAge(result, confidence, 'p90'),
    to: crossingAge(result, confidence, 'p10'),
  }
}

/**
 * First age at which no portfolio is required at all — guaranteed income
 * (Social Security, net of tax) covers the whole spend from there on, so the
 * solver's per-run minimum is literally zero. Undefined when a portfolio is
 * always needed, which is the usual case: it takes guaranteed income meeting or
 * exceeding spending. The requirement is non-increasing in age, so the first
 * zero is the start of a zero tail. Pure.
 */
export function fullyFundedAge(
  result: FundingCurveResult,
  confidence: number,
): number | undefined {
  return result.points.find((p) => requiredAt(p, confidence) === 0)?.age
}

/**
 * What you'd have against what you'd need at one age. `gap` is signed: negative
 * is a shortfall, positive is slack. Undefined outside the solved range. Pure.
 */
export function gapAt(
  result: FundingCurveResult,
  confidence: number,
  age: number,
): { needed: number; projected: number; gap: number } | undefined {
  const point = result.points.find((p) => p.age === age)
  if (!point) return undefined
  const needed = requiredAt(point, confidence)
  const projected = point.projected.p50
  return { needed, projected, gap: projected - needed }
}

/**
 * Scale a plan's accounts to a target total while preserving their shape — the
 * tax mix, the stock allocation and each taxable account's basis fraction. This
 * is what makes "$2M at 60" a well-defined question: $2M held as traditional
 * dollars is worth materially less after tax than $2M of Roth.
 */
function scaleAccounts(template: Account[], total: number, retireAge: number): Account[] {
  const sum = template.reduce((s, a) => s + a.balance, 0)
  // A template with nothing in it carries no mix to preserve; fall back to an
  // even split so the solve still has somewhere to put the money.
  const share = (a: Account) => (sum > 0 ? a.balance / sum : 1 / Math.max(1, template.length))
  return template.map((a) => {
    const balance = total * share(a)
    const basisFraction = a.balance > 0 ? Math.min(1, (a.costBasis ?? a.balance) / a.balance) : 1
    return {
      ...a,
      balance,
      ...(a.type === 'taxable' ? { costBasis: balance * basisFraction } : {}),
      contributionAmount: 0,
      contributeMax: false,
      contributionEndAge: retireAge,
      withdrawalStartAge: Math.min(a.withdrawalStartAge, retireAge),
    }
  })
}

/**
 * The "retire right now at `age` holding `total`" plan. Starting the projection
 * at `age` means today's dollars and age-`age` dollars are the same unit — the
 * price level restarts at 1 — which is why the whole curve is real and the
 * chart doesn't offer a nominal toggle.
 */
function retireAtAge(
  inputs: SimulationInputs,
  age: number,
  total: number,
  template: Account[],
): SimulationInputs {
  return {
    ...inputs,
    person: { ...inputs.person, currentAge: age, retirementAge: age },
    accounts: scaleAccounts(template, total, age),
  }
}

/**
 * The smallest starting balance that carries one sampled market path from `age`
 * to the end of the plan. Brackets by doubling, then bisects to `tolerance`.
 * Relies on survival being monotone in the starting balance.
 */
function minimumSurvivingBalance(
  inputs: SimulationInputs,
  age: number,
  template: Account[],
  rates: SampledRates[],
  tolerance: number,
): number {
  const survives = (balance: number) =>
    runSingleProjection(retireAtAge(inputs, age, balance, template), rates).succeeded

  if (survives(0)) return 0

  let hi = INITIAL_CEILING
  let doublings = 0
  while (!survives(hi) && doublings++ < MAX_CEILING_DOUBLINGS) hi *= 2
  // Nothing finite survives this path (spending that outruns any portfolio).
  // Report the ceiling: it keeps the quantile finite and the curve drawable.
  if (!survives(hi)) return hi

  let lo = 0
  while (hi - lo > tolerance) {
    const mid = (lo + hi) / 2
    if (survives(mid)) hi = mid
    else lo = mid
  }
  return hi
}

/**
 * One accumulation pass: what the plan is worth at each age if you never retire.
 * Returns per-year real balances across runs plus the median account mix, which
 * the requirement solve uses as its template so "how much do I need at 60" is
 * asked against the mix you're actually on track to hold.
 */
function runAccumulation(
  inputs: SimulationInputs,
  runCount: number,
): { realByAge: Map<number, number[]>; mixByAge: Map<number, Account[]> } {
  const { currentAge, maxAge } = inputs.person
  // Work to the end and never draw, so the balance at each age is purely
  // "contributions + growth to here". Longevity is pinned to `fixed`: this
  // series answers "what will I have at X given I'm alive at X", so letting
  // runs die early would thin the later years for no reason.
  const accInputs: SimulationInputs = {
    ...withRetirementAge(inputs, maxAge),
    longevity: 'fixed',
  }
  const segments = buildSegments(inputs)
  const rng = mulberry32(inputs.seed)
  const years = maxAge - currentAge

  const realByAge = new Map<number, number[]>()
  const sharesByAge = new Map<number, Map<string, number[]>>()

  for (let run = 0; run < runCount; run++) {
    const rates = buildRateSchedule(segments, currentAge, years, rng)
    const projection = runSingleProjection(accInputs, rates)
    // Deflate by this run's OWN realized price level rather than an expected
    // deflator — we have the schedule in hand, so there's no reason to average.
    let priceLevel = 1
    for (let y = 0; y < projection.yearlyResults.length; y++) {
      priceLevel *= 1 + rates[Math.min(y, rates.length - 1)].inflation
      const state = projection.yearlyResults[y]
      const real = state.totalBalance / priceLevel
      const ages = realByAge.get(state.age) ?? []
      ages.push(real)
      realByAge.set(state.age, ages)

      const shares = sharesByAge.get(state.age) ?? new Map<string, number[]>()
      for (const account of inputs.accounts) {
        const balance = state.accountBalances[account.id] ?? 0
        const list = shares.get(account.id) ?? []
        list.push(state.totalBalance > 0 ? balance / state.totalBalance : 0)
        shares.set(account.id, list)
      }
      sharesByAge.set(state.age, shares)
    }
  }

  const mixByAge = new Map<number, Account[]>()
  // Age `currentAge` is today — the real accounts, not a projection of them.
  mixByAge.set(currentAge, inputs.accounts)
  realByAge.set(currentAge, [inputs.accounts.reduce((s, a) => s + a.balance, 0)])
  for (const [age, shares] of sharesByAge) {
    // Median share per account, then let `scaleAccounts` renormalise — medians
    // of shares don't sum to 1, and the shape is all we need from them.
    const mix = inputs.accounts.map((account) => ({
      ...account,
      balance: percentile(shares.get(account.id) ?? [0], 50),
      costBasis: undefined,
    }))
    const hasMoney = mix.some((a) => a.balance > 0)
    mixByAge.set(age, hasMoney ? mix : inputs.accounts)
  }
  return { realByAge, mixByAge }
}

/**
 * Force the requirement to fall with age. Funding fewer remaining years can't
 * genuinely need more money, so any rise is sampling noise. Smoothing at each
 * *rank* rather than at one confidence keeps every quantile consistent, and the
 * elementwise max of two ascending arrays is still ascending, so the per-age
 * arrays stay sorted. Mutates in place, right to left.
 */
function enforceNonIncreasing(points: FundingCurvePoint[]): void {
  for (let i = points.length - 2; i >= 0; i--) {
    const here = points[i].requiredSorted
    const next = points[i + 1].requiredSorted
    for (let k = 0; k < here.length && k < next.length; k++) {
      if (next[k] > here[k]) here[k] = next[k]
    }
  }
}

/**
 * Solve the funding curve. Heavy — one accumulation pass plus a per-run
 * bisection at every age — so callers run it off the main thread and cache it.
 */
export function runFundingCurve(
  inputs: SimulationInputs,
  opts: FundingCurveOptions = {},
): FundingCurveResult {
  const runCount = opts.runCount ?? DEFAULT_RUN_COUNT
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE
  const { currentAge, maxAge } = inputs.person
  // Never empty: someone already past MAX_SOLVE_AGE still gets the one age they
  // can still choose, rather than a blank chart.
  const ceiling = Math.min(
    maxAge - 1,
    Math.max(currentAge, Math.min(opts.maxSolveAge ?? MAX_SOLVE_AGE, MAX_SOLVE_AGE)),
  )

  const { realByAge, mixByAge } = runAccumulation(inputs, runCount)
  const segments = buildSegments(inputs)
  const stochastic = (inputs.longevity ?? 'fixed') === 'stochastic'

  const ages: number[] = []
  for (let age = currentAge; age <= ceiling; age++) ages.push(age)

  const points: FundingCurvePoint[] = []
  for (const age of ages) {
    const template = mixByAge.get(age) ?? inputs.accounts
    // Reseeding per age gives every age the same market draws (common random
    // numbers), so the curve's shape is economics rather than sampling luck.
    const rng = mulberry32(inputs.seed)
    const minima: number[] = []
    for (let run = 0; run < runCount; run++) {
      // Under stochastic longevity, condition on having reached this age —
      // someone retiring at 70 has already outlived the draws that end before it.
      const endAge = stochastic ? sampleAgeAtDeath(age, rng) : maxAge
      const horizon = Math.max(1, endAge - age)
      const rates = buildRateSchedule(segments, age, horizon, rng)
      const runInputs = stochastic
        ? { ...inputs, person: { ...inputs.person, maxAge: endAge } }
        : inputs
      minima.push(minimumSurvivingBalance(runInputs, age, template, rates, tolerance))
    }
    minima.sort((a, b) => a - b)

    const balances = realByAge.get(age) ?? [0]
    points.push({
      age,
      requiredSorted: minima,
      projected: {
        p10: percentile(balances, 10),
        p50: percentile(balances, 50),
        p90: percentile(balances, 90),
      },
    })
    opts.onProgress?.({ done: points.length, total: ages.length })
  }

  enforceNonIncreasing(points)
  return { points, runCount, retirementAge: inputs.person.retirementAge }
}
