import { describe, it, expect } from 'vitest'
import { buildRateSchedule, DEFAULT_PERSISTENCE, DEFAULT_RATE_CORRELATION } from './montecarlo'
import type { RateSegment } from './montecarlo'
import { mulberry32, boxMullerNormal } from '../math'

const SEG: RateSegment = {
  startAge: 40,
  growthMean: 0.07,
  growthSigma: 0.15,
  inflationMean: 0.025,
  inflationSigma: 0.02,
}

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

describe('buildRateSchedule', () => {
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

  it('with zero persistence and zero correlation reproduces the plain per-year IID draws exactly', () => {
    const years = 40
    const sched = buildRateSchedule([SEG], 40, years, mulberry32(42), {
      stock: 0,
      inflation: 0,
    }, 0)
    // Replicate the old per-year draw order: stock shock then inflation shock.
    const rng = mulberry32(42)
    for (let y = 0; y < years; y++) {
      const eStock = boxMullerNormal(0, 1, rng)
      const eInfl = boxMullerNormal(0, 1, rng)
      expect(sched[y].stockGrowth).toBeCloseTo(SEG.growthMean + SEG.growthSigma * eStock, 12)
      expect(sched[y].inflation).toBeCloseTo(SEG.inflationMean + SEG.inflationSigma * eInfl, 12)
    }
  })

  it('preserves each segment marginal (mean & sigma) under default persistence', () => {
    const sched = buildRateSchedule([SEG], 40, 8000, mulberry32(99))
    const stock = sched.map((r) => r.stockGrowth)
    const infl = sched.map((r) => r.inflation)
    expect(mean(stock)).toBeCloseTo(SEG.growthMean, 2)
    expect(std(stock)).toBeCloseTo(SEG.growthSigma, 2)
    expect(mean(infl)).toBeCloseTo(SEG.inflationMean, 2)
    expect(std(infl)).toBeCloseTo(SEG.inflationSigma, 2)
  })

  it('injects the requested year-to-year autocorrelation', () => {
    const sched = buildRateSchedule([SEG], 40, 8000, mulberry32(123), {
      stock: 0.3,
      inflation: 0.7,
    })
    const acStock = lag1Autocorr(sched.map((r) => r.stockGrowth))
    const acInfl = lag1Autocorr(sched.map((r) => r.inflation))
    expect(acStock).toBeGreaterThan(0.22)
    expect(acStock).toBeLessThan(0.38)
    expect(acInfl).toBeGreaterThan(0.62)
    expect(acInfl).toBeLessThan(0.78)
  })

  it('zero persistence yields ~uncorrelated years', () => {
    const sched = buildRateSchedule([SEG], 40, 8000, mulberry32(321), {
      stock: 0,
      inflation: 0,
    })
    expect(Math.abs(lag1Autocorr(sched.map((r) => r.stockGrowth)))).toBeLessThan(0.05)
    expect(Math.abs(lag1Autocorr(sched.map((r) => r.inflation)))).toBeLessThan(0.05)
  })

  it('default persistence is positive for both streams (more realistic than IID)', () => {
    expect(DEFAULT_PERSISTENCE.stock).toBeGreaterThan(0)
    expect(DEFAULT_PERSISTENCE.inflation).toBeGreaterThan(0)
    // Inflation is empirically far more persistent than annual equity returns.
    expect(DEFAULT_PERSISTENCE.inflation).toBeGreaterThan(DEFAULT_PERSISTENCE.stock)
  })

  it('switches segment marginals at the breakpoint age', () => {
    const lowVol: RateSegment = { ...SEG, startAge: 40, growthSigma: 0.05 }
    const highVol: RateSegment = { ...SEG, startAge: 60, growthSigma: 0.25 }
    // 40 yrs of low-vol (ages 40-59), then 40 yrs of high-vol (ages 60-99).
    const sched = buildRateSchedule([lowVol, highVol], 40, 80, mulberry32(11))
    const before = std(sched.slice(0, 20).map((r) => r.stockGrowth))
    const after = std(sched.slice(40, 80).map((r) => r.stockGrowth))
    expect(after).toBeGreaterThan(before * 2)
  })

  it('couples returns and inflation negatively by default (#9)', () => {
    // High inflation historically depresses nominal equity returns (the 1970s);
    // the default correlation makes a high-inflation year tend to be a low-return
    // year. Persistence attenuates but does not flip the sign.
    const sched = buildRateSchedule([SEG], 40, 8000, mulberry32(2024))
    const corr = pearson(sched.map((r) => r.stockGrowth), sched.map((r) => r.inflation))
    expect(corr).toBeLessThan(-0.12)
    expect(corr).toBeGreaterThan(-0.5)
  })

  it('correlation 0 leaves returns and inflation ~independent', () => {
    const sched = buildRateSchedule([SEG], 40, 8000, mulberry32(2024), DEFAULT_PERSISTENCE, 0)
    const corr = pearson(sched.map((r) => r.stockGrowth), sched.map((r) => r.inflation))
    expect(Math.abs(corr)).toBeLessThan(0.05)
  })

  it('correlation preserves each stream marginal (mean & sigma)', () => {
    const sched = buildRateSchedule([SEG], 40, 8000, mulberry32(55))
    expect(mean(sched.map((r) => r.inflation))).toBeCloseTo(SEG.inflationMean, 2)
    expect(std(sched.map((r) => r.inflation))).toBeCloseTo(SEG.inflationSigma, 2)
    expect(mean(sched.map((r) => r.stockGrowth))).toBeCloseTo(SEG.growthMean, 2)
  })

  it('default correlation is negative', () => {
    expect(DEFAULT_RATE_CORRELATION).toBeLessThan(0)
  })
})
