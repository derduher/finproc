import { describe, it, expect } from 'vitest'
import {
  buildRateSchedule,
  DEFAULT_PERSISTENCE,
  DEFAULT_RATE_CORRELATION,
  ANNUAL_VOLATILITY,
} from './montecarlo'
import type { RateSegment, AnnualVolatility } from './montecarlo'
import { mulberry32 } from '../math'

/**
 * Semantics under test (the variance-calibration fix):
 *  - A segment's growthSigma/inflationSigma is EPISTEMIC — uncertainty about the
 *    long-run average rate. One standardized draw per stream per run shifts every
 *    year of that run's schedule together.
 *  - Year-to-year market volatility is a separate, calibrated constant
 *    (ANNUAL_VOLATILITY), applied with AR(1) persistence and the stock↔inflation
 *    cross-correlation. It exists even when the user band is degenerate.
 *  - The user band is read as a CAGR (long-run compounded) band: the arithmetic
 *    per-year mean gets +σ²/2 volatility-drag compensation so the median realized
 *    CAGR matches the drawn long-run average.
 */

/** Segment with NO epistemic uncertainty — isolates the per-year volatility layer. */
const SEG: RateSegment = {
  startAge: 40,
  growthMean: 0.07,
  growthSigma: 0,
  inflationMean: 0.025,
  inflationSigma: 0,
  bondMean: 0.04,
  bondSigma: 0,
}

/** Segment with epistemic uncertainty (a 4%–10% style band → σ ≈ 0.0234). */
const EPISTEMIC_SEG: RateSegment = {
  ...SEG,
  growthSigma: 0.0234,
  inflationSigma: 0.0078,
  bondSigma: 0.0156,
}

const NO_VOL: AnnualVolatility = { stock: 0, inflation: 0, bond: 0 }
const TEST_VOL: AnnualVolatility = { stock: 0.15, inflation: 0.02, bond: 0.07 }
const NO_PERSISTENCE = { stock: 0, inflation: 0, bond: 0 }

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function std(xs: number[]): number {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

/** Sample lag-1 autocorrelation of a series. */
function lag1Autocorr(xs: number[]): number {
  const m = mean(xs)
  let num = 0
  let den = 0
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i] - m
    den += d * d
    if (i > 0) num += (xs[i - 1] - m) * d
  }
  return num / den
}

/** Pearson correlation between two equal-length series. */
function pearson(xs: number[], ys: number[]): number {
  const mx = mean(xs)
  const my = mean(ys)
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  return num / Math.sqrt(dx * dy)
}

describe('buildRateSchedule — basics', () => {
  it('returns one finite rate pair per year', () => {
    const sched = buildRateSchedule([SEG], 40, 30, mulberry32(1))
    expect(sched).toHaveLength(30)
    for (const r of sched) {
      expect(Number.isFinite(r.stockGrowth)).toBe(true)
      expect(Number.isFinite(r.inflation)).toBe(true)
    }
  })

  it('is deterministic for a given seed', () => {
    const a = buildRateSchedule([SEG], 40, 50, mulberry32(7))
    const b = buildRateSchedule([SEG], 40, 50, mulberry32(7))
    expect(a).toEqual(b)
  })

  it('clamps draws so an annual return can never reach −100%', () => {
    // Absurdly wide vol forces draws deep into the left tail.
    const sched = buildRateSchedule([SEG], 40, 2000, mulberry32(13), NO_PERSISTENCE, 0, {
      stock: 5,
      inflation: 3,
      bond: 4,
    })
    for (const r of sched) {
      expect(r.bondGrowth!).toBeGreaterThan(-1)
    }
    for (const r of sched) {
      expect(r.stockGrowth).toBeGreaterThan(-1)
      expect(r.inflation).toBeGreaterThan(-1)
    }
  })
})

describe('buildRateSchedule — epistemic band (user P10–P90)', () => {
  it('with zero annual vol, each run is a constant schedule at its drawn long-run mean', () => {
    const sched = buildRateSchedule([EPISTEMIC_SEG], 40, 30, mulberry32(3), NO_PERSISTENCE, 0, NO_VOL)
    const stocks = sched.map((r) => r.stockGrowth)
    for (const s of stocks) expect(s).toBeCloseTo(stocks[0], 12)
  })

  it('long-run means vary ACROSS runs with std ≈ the segment epistemic sigma', () => {
    const rng = mulberry32(99)
    const means: number[] = []
    const inflMeans: number[] = []
    for (let run = 0; run < 4000; run++) {
      const sched = buildRateSchedule([EPISTEMIC_SEG], 40, 1, rng, NO_PERSISTENCE, 0, NO_VOL)
      means.push(sched[0].stockGrowth)
      inflMeans.push(sched[0].inflation)
    }
    expect(mean(means)).toBeCloseTo(EPISTEMIC_SEG.growthMean, 2)
    expect(std(means)).toBeCloseTo(EPISTEMIC_SEG.growthSigma, 2)
    expect(mean(inflMeans)).toBeCloseTo(EPISTEMIC_SEG.inflationMean, 2)
    expect(std(inflMeans)).toBeCloseTo(EPISTEMIC_SEG.inflationSigma, 2)
  })

  it('a run pessimistic in one segment is pessimistic in the next (shared epistemic draw)', () => {
    const lowSeg: RateSegment = { ...EPISTEMIC_SEG, startAge: 40 }
    const highSeg: RateSegment = { ...EPISTEMIC_SEG, startAge: 60, growthMean: 0.05 }
    const rng = mulberry32(17)
    for (let run = 0; run < 200; run++) {
      const sched = buildRateSchedule([lowSeg, highSeg], 40, 40, rng, NO_PERSISTENCE, 0, NO_VOL)
      const offsetA = sched[0].stockGrowth - lowSeg.growthMean
      const offsetB = sched[30].stockGrowth - highSeg.growthMean
      expect(offsetB).toBeCloseTo(offsetA, 10)
    }
  })

  it('segment epistemic sigma applies from its breakpoint age (across-run spread widens)', () => {
    const tight: RateSegment = { ...SEG, startAge: 40, growthSigma: 0.005 }
    const wide: RateSegment = { ...SEG, startAge: 60, growthSigma: 0.05 }
    const rng = mulberry32(11)
    const early: number[] = []
    const late: number[] = []
    for (let run = 0; run < 2000; run++) {
      const sched = buildRateSchedule([tight, wide], 40, 40, rng, NO_PERSISTENCE, 0, NO_VOL)
      early.push(sched[0].stockGrowth)
      late.push(sched[30].stockGrowth)
    }
    expect(std(late)).toBeGreaterThan(std(early) * 5)
  })
})

describe('buildRateSchedule — per-year volatility layer', () => {
  it('applies year-to-year volatility even when the user band is degenerate', () => {
    const sched = buildRateSchedule([SEG], 40, 8000, mulberry32(42), NO_PERSISTENCE, 0, TEST_VOL)
    const stock = sched.map((r) => r.stockGrowth)
    const infl = sched.map((r) => r.inflation)
    expect(std(stock)).toBeCloseTo(TEST_VOL.stock, 2)
    expect(std(infl)).toBeCloseTo(TEST_VOL.inflation, 2)
  })

  it('compensates volatility drag: per-year arithmetic mean ≈ band mean + σ²/2', () => {
    const sched = buildRateSchedule([SEG], 40, 8000, mulberry32(42), NO_PERSISTENCE, 0, TEST_VOL)
    expect(mean(sched.map((r) => r.stockGrowth))).toBeCloseTo(
      SEG.growthMean + TEST_VOL.stock ** 2 / 2,
      2,
    )
  })

  it('median realized 30-year CAGR ≈ the drawn long-run mean (drag compensation works)', () => {
    const rng = mulberry32(2718)
    const cagrs: number[] = []
    for (let run = 0; run < 600; run++) {
      const sched = buildRateSchedule([SEG], 40, 30, rng, DEFAULT_PERSISTENCE, 0, {
        stock: ANNUAL_VOLATILITY.stock,
        inflation: 0,
        bond: 0,
      })
      let level = 1
      for (const r of sched) level *= 1 + r.stockGrowth
      cagrs.push(level ** (1 / 30) - 1)
    }
    const sorted = [...cagrs].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    expect(median).toBeGreaterThan(SEG.growthMean - 0.005)
    expect(median).toBeLessThan(SEG.growthMean + 0.01)
  })

  it('produces a realistic share of negative stock years at default calibration', () => {
    // Historically ~26% of years are negative (the app's own 1928–2023 series).
    const sched = buildRateSchedule([SEG], 40, 8000, mulberry32(31))
    const negFrac = sched.filter((r) => r.stockGrowth < 0).length / sched.length
    expect(negFrac).toBeGreaterThan(0.18)
    expect(negFrac).toBeLessThan(0.4)
  })

  it('default annual volatility is calibrated near historical levels', () => {
    expect(ANNUAL_VOLATILITY.stock).toBeGreaterThan(0.12)
    expect(ANNUAL_VOLATILITY.stock).toBeLessThan(0.22)
    expect(ANNUAL_VOLATILITY.inflation).toBeGreaterThan(0.01)
    expect(ANNUAL_VOLATILITY.inflation).toBeLessThan(0.05)
  })
})

describe('buildRateSchedule — bond stream', () => {
  it('every year carries a finite bondGrowth', () => {
    const sched = buildRateSchedule([SEG], 40, 30, mulberry32(5))
    for (const r of sched) {
      expect(Number.isFinite(r.bondGrowth)).toBe(true)
    }
  })

  it('bond epistemic band: run-level means vary across runs with std ≈ bondSigma', () => {
    const rng = mulberry32(77)
    const means: number[] = []
    for (let run = 0; run < 4000; run++) {
      const sched = buildRateSchedule([EPISTEMIC_SEG], 40, 1, rng, NO_PERSISTENCE, 0, NO_VOL)
      means.push(sched[0].bondGrowth!)
    }
    expect(mean(means)).toBeCloseTo(EPISTEMIC_SEG.bondMean, 2)
    expect(std(means)).toBeCloseTo(EPISTEMIC_SEG.bondSigma, 2)
  })

  it('per-year bond volatility applies with drag compensation', () => {
    const sched = buildRateSchedule([SEG], 40, 8000, mulberry32(88), NO_PERSISTENCE, 0, TEST_VOL)
    const bonds = sched.map((r) => r.bondGrowth!)
    expect(std(bonds)).toBeCloseTo(TEST_VOL.bond, 2)
    expect(mean(bonds)).toBeCloseTo(SEG.bondMean + TEST_VOL.bond ** 2 / 2, 2)
  })

  it('default bond volatility is far below stock volatility and calibrated sanely', () => {
    expect(ANNUAL_VOLATILITY.bond).toBeGreaterThan(0.03)
    expect(ANNUAL_VOLATILITY.bond).toBeLessThan(0.12)
    expect(ANNUAL_VOLATILITY.bond).toBeLessThan(ANNUAL_VOLATILITY.stock)
  })
})

describe('buildRateSchedule — persistence and correlation', () => {
  it('injects the requested year-to-year autocorrelation', () => {
    const sched = buildRateSchedule(
      [SEG],
      40,
      8000,
      mulberry32(123),
      { stock: 0.3, inflation: 0.7, bond: 0 },
      0,
      TEST_VOL,
    )
    const acStock = lag1Autocorr(sched.map((r) => r.stockGrowth))
    const acInfl = lag1Autocorr(sched.map((r) => r.inflation))
    expect(acStock).toBeGreaterThan(0.22)
    expect(acStock).toBeLessThan(0.38)
    expect(acInfl).toBeGreaterThan(0.62)
    expect(acInfl).toBeLessThan(0.78)
  })

  it('zero persistence yields ~uncorrelated years', () => {
    const sched = buildRateSchedule([SEG], 40, 8000, mulberry32(321), NO_PERSISTENCE, 0, TEST_VOL)
    expect(Math.abs(lag1Autocorr(sched.map((r) => r.stockGrowth)))).toBeLessThan(0.05)
    expect(Math.abs(lag1Autocorr(sched.map((r) => r.inflation)))).toBeLessThan(0.05)
  })

  it('default persistence is positive for both streams (more realistic than IID)', () => {
    expect(DEFAULT_PERSISTENCE.stock).toBeGreaterThan(0)
    expect(DEFAULT_PERSISTENCE.inflation).toBeGreaterThan(0)
    // Inflation is empirically far more persistent than annual equity returns.
    expect(DEFAULT_PERSISTENCE.inflation).toBeGreaterThan(DEFAULT_PERSISTENCE.stock)
  })

  it('couples returns and inflation negatively by default', () => {
    const sched = buildRateSchedule([SEG], 40, 8000, mulberry32(2024))
    const corr = pearson(sched.map((r) => r.stockGrowth), sched.map((r) => r.inflation))
    expect(corr).toBeLessThan(-0.12)
    expect(corr).toBeGreaterThan(-0.5)
  })

  it('correlation 0 leaves returns and inflation ~independent', () => {
    const sched = buildRateSchedule([SEG], 40, 8000, mulberry32(2024), DEFAULT_PERSISTENCE, 0, TEST_VOL)
    const corr = pearson(sched.map((r) => r.stockGrowth), sched.map((r) => r.inflation))
    expect(Math.abs(corr)).toBeLessThan(0.05)
  })

  it('default correlation is negative', () => {
    expect(DEFAULT_RATE_CORRELATION).toBeLessThan(0)
  })
})
